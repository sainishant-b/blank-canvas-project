import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Get current hour in user's timezone
function getCurrentHourInTimezone(timezone: string): number {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    return parseInt(formatter.format(now), 10);
  } catch {
    // Fallback to UTC
    return new Date().getUTCHours();
  }
}

// Get today's date string in user's timezone
function getTodayInTimezone(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }); // en-CA gives YYYY-MM-DD
    return formatter.format(now);
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const now = new Date();
    console.log(`Running scheduled notifications at ${now.toISOString()}`);
    
    // Get all user profiles
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, work_hours_start, work_hours_end, check_in_frequency, timezone');
    
    if (profileError) {
      console.error('Error fetching profiles:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch profiles' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No profiles found', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let notificationsSent = 0;
    let usersProcessed = 0;

    for (const profile of profiles) {
      try {
        const userTimezone = profile.timezone || 'UTC';
        const currentHour = getCurrentHourInTimezone(userTimezone);
        const today = getTodayInTimezone(userTimezone);

        const workStart = parseInt(profile.work_hours_start?.split(':')[0] || '9');
        const workEnd = parseInt(profile.work_hours_end?.split(':')[0] || '17');
        
        const isWorkHours = currentHour >= workStart && currentHour < workEnd;
        
        if (!isWorkHours) {
          console.log(`Skipping user ${profile.id} - outside work hours (${workStart}-${workEnd}, tz: ${userTimezone}, hour: ${currentHour})`);
          continue;
        }

        usersProcessed++;

        // Check for overdue tasks
        const { data: overdueTasks, error: overdueError } = await supabase
          .from('tasks')
          .select('id, title, due_date, priority')
          .eq('user_id', profile.id)
          .eq('status', 'pending')
          .lt('due_date', today)
          .order('priority', { ascending: false })
          .limit(3);

        if (overdueError) {
          console.error(`Error fetching overdue tasks for user ${profile.id}:`, overdueError);
          continue;
        }

        if (overdueTasks && overdueTasks.length > 0) {
          try {
            const { error: pushError } = await supabase.functions.invoke('send-push-notification', {
              body: {
                userId: profile.id,
                title: `⚠️ ${overdueTasks.length} Overdue Task${overdueTasks.length > 1 ? 's' : ''}`,
                body: overdueTasks.length === 1 
                  ? `"${overdueTasks[0].title}" is past due!`
                  : `"${overdueTasks[0].title}" and ${overdueTasks.length - 1} more need attention`,
                data: { 
                  type: 'overdue-alert',
                  taskIds: overdueTasks.map(t => t.id)
                },
                tag: 'overdue-tasks'
              }
            });

            if (pushError) {
              console.error(`Error sending overdue notification to user ${profile.id}:`, pushError);
            } else {
              notificationsSent++;
              console.log(`Sent overdue notification to user ${profile.id} (${overdueTasks.length} tasks)`);
            }
          } catch (e) {
            console.error(`Exception sending overdue notification to user ${profile.id}:`, e);
          }
        }

        // Check for tasks due today
        const { data: todayTasks, error: todayError } = await supabase
          .from('tasks')
          .select('id, title, due_date, priority')
          .eq('user_id', profile.id)
          .eq('status', 'pending')
          .eq('due_date', today)
          .order('priority', { ascending: false })
          .limit(5);

        if (todayError) {
          console.error(`Error fetching today's tasks for user ${profile.id}:`, todayError);
          continue;
        }

        // Daily summary at start of work hours
        if (currentHour === workStart && todayTasks && todayTasks.length > 0) {
          try {
            const { error: pushError } = await supabase.functions.invoke('send-push-notification', {
              body: {
                userId: profile.id,
                title: `📋 ${todayTasks.length} Task${todayTasks.length > 1 ? 's' : ''} Today`,
                body: todayTasks.length === 1 
                  ? `Don't forget: "${todayTasks[0].title}"`
                  : `Starting with: "${todayTasks[0].title}"`,
                data: { 
                  type: 'daily-summary',
                  taskIds: todayTasks.map(t => t.id)
                },
                tag: 'daily-summary'
              }
            });

            if (pushError) {
              console.error(`Error sending daily summary to user ${profile.id}:`, pushError);
            } else {
              notificationsSent++;
              console.log(`Sent daily summary to user ${profile.id}`);
            }
          } catch (e) {
            console.error(`Exception sending daily summary to user ${profile.id}:`, e);
          }
        }

        // Check-in reminder based on frequency
        const frequency = profile.check_in_frequency || 4;
        const shouldCheckIn = currentHour % frequency === 0 && currentHour !== workStart;
        
        if (shouldCheckIn) {
          try {
            const { error: pushError } = await supabase.functions.invoke('send-push-notification', {
              body: {
                userId: profile.id,
                title: '🎯 Quick Check-in',
                body: 'How\'s your productivity? Take a moment to reflect.',
                data: { type: 'check-in' },
                tag: 'check-in'
              }
            });

            if (pushError) {
              console.error(`Error sending check-in to user ${profile.id}:`, pushError);
            } else {
              notificationsSent++;
              console.log(`Sent check-in reminder to user ${profile.id}`);
            }
          } catch (e) {
            console.error(`Exception sending check-in to user ${profile.id}:`, e);
          }
        }

      } catch (userError) {
        console.error(`Error processing user ${profile.id}:`, userError);
      }
    }

    console.log(`Completed: ${usersProcessed} users processed, ${notificationsSent} notifications sent`);

    return new Response(
      JSON.stringify({ 
        message: 'Scheduled notifications processed',
        usersProcessed,
        notificationsSent,
        timestamp: now.toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error in scheduled-notifications:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
