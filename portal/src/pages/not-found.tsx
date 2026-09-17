import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon"

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4 neu rounded-lg">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <Icon name="alert-circle" className="text-muted-foreground" size={32} />
            <h1 className="text-2xl font-bold text-foreground">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-foreground/70">
            Did you forget to add the page to the router?
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
