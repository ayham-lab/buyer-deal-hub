import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

export default function OAuthCallback() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const code = params.get("code") ?? "";
  const locationId = params.get("locationId") ?? "";
  const companyId = params.get("companyId") ?? "";

  const codeDisplay = code.length > 12 ? `${code.slice(0, 12)}...` : code;

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
          </div>
          <CardTitle className="text-center text-2xl font-semibold">
            Install successful
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2 rounded-lg bg-muted p-4 text-sm text-foreground">
            <p>
              <span className="font-medium">Authorization code received:</span>{" "}
              {codeDisplay || "N/A"}
            </p>
            <p>
              <span className="font-medium">Location ID:</span>{" "}
              {locationId || "N/A"}
            </p>
            <p>
              <span className="font-medium">Company ID:</span>{" "}
              {companyId || "N/A"}
            </p>
          </div>
          <Button onClick={() => nav("/login")} className="w-full">
            Continue to Dispo Tool
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
