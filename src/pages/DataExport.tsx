import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, FileJson, Image, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TABLES = [
  "tasks",
  "goals",
  "milestones",
  "profiles",
  "task_proofs",
  "task_history",
  "repeat_completions",
  "subtasks",
  "check_ins",
  "work_sessions",
  "notification_preferences",
  "push_subscriptions",
] as const;

type TableName = (typeof TABLES)[number];

const DataExport = () => {
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [exported, setExported] = useState<Record<string, boolean>>({});
  const [storageFiles, setStorageFiles] = useState<string[]>([]);
  const [storageLoading, setStorageLoading] = useState(false);
  const { toast } = useToast();

  const downloadJSON = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportTable = async (table: TableName) => {
    setLoading((p) => ({ ...p, [table]: true }));
    try {
      const { data, error } = await (supabase.from(table).select("*") as any);
      if (error) throw error;
      downloadJSON(data || [], `${table}.json`);
      setExported((p) => ({ ...p, [table]: true }));
      toast({ title: `Exported ${table}`, description: `${(data || []).length} records downloaded.` });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading((p) => ({ ...p, [table]: false }));
    }
  };

  const exportAll = async () => {
    setLoading((p) => ({ ...p, all: true }));
    try {
      const allData: Record<string, any[]> = {};
      for (const table of TABLES) {
        const { data, error } = await (supabase.from(table).select("*") as any);
        if (error) throw error;
        allData[table] = data || [];
      }
      downloadJSON(allData, "full_database_export.json");
      const done: Record<string, boolean> = {};
      TABLES.forEach((t) => (done[t] = true));
      setExported(done);
      toast({ title: "Full export complete", description: "All tables downloaded as one file." });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading((p) => ({ ...p, all: false }));
    }
  };

  const listStorageFiles = async () => {
    setStorageLoading(true);
    try {
      const { data, error } = await supabase.storage.from("proof-images").list("", { limit: 1000 });
      if (error) throw error;
      const urls = (data || []).map(
        (f) => supabase.storage.from("proof-images").getPublicUrl(f.name).data.publicUrl
      );
      setStorageFiles(urls);
      toast({ title: "Storage files listed", description: `${urls.length} files found.` });
    } catch (e: any) {
      toast({ title: "Failed to list files", description: e.message, variant: "destructive" });
    } finally {
      setStorageLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-3xl space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Data Export</h1>
        <p className="text-muted-foreground mt-1">
          Download all your data as JSON for migration to Appwrite or any other platform.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5" /> Export All Tables
          </CardTitle>
          <CardDescription>Download every table in a single JSON file.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={exportAll} disabled={loading.all} className="w-full">
            {loading.all ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
            Download Full Export
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Individual Tables</CardTitle>
          <CardDescription>Export tables one at a time.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {TABLES.map((table) => (
            <Button
              key={table}
              variant={exported[table] ? "secondary" : "outline"}
              onClick={() => exportTable(table)}
              disabled={loading[table]}
              className="justify-between"
            >
              <span className="flex items-center gap-2">
                {exported[table] && <CheckCircle2 className="h-4 w-4 text-primary" />}
                {table}
              </span>
              {loading[table] ? <Loader2 className="animate-spin h-4 w-4" /> : <Download className="h-4 w-4" />}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" /> Storage Files
          </CardTitle>
          <CardDescription>List files in the proof-images bucket for manual download.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={listStorageFiles} disabled={storageLoading} variant="outline" className="w-full">
            {storageLoading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
            List Storage Files
          </Button>
          {storageFiles.length > 0 && (
            <div className="space-y-1 text-sm">
              {storageFiles.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-primary underline break-all"
                >
                  {url.split("/").pop()}
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DataExport;
