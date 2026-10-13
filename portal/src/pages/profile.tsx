import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Icon } from "@/components/ui/icon"
import { hasConfig as hasFirebase } from "@/lib/firebase";
import { useFirebaseUpload } from "@/hooks/use-firebase-upload";
import { UploadProgressOverlay, SaveProgressIndicator } from "@/components/upload-progress";

function formatRole(role?: string | null) {
  if (!role) return "Member";
  if (["manager", "officer"].includes(role.toLowerCase())) return "Officer";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function Profile() {
  const { user, setUser } = useAuth();
  const { toast } = useToast();

  const [fullName, setFullName] = useState(user?.fullName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { progress: uploadProgress, uploading, fileName, fileSize, upload } = useFirebaseUpload();

  const profileMutation = useMutation({
    mutationFn: async (data: { fullName?: string; email?: string }) => {
      const res = await fetch(`/api/users/${user?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update profile");
      return res.json();
    },
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
      toast({ title: "Profile updated" });
    },
    onError: () => {
      toast({ title: "Failed to update profile", variant: "destructive" });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to change password");
      }
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Password changed successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to change password", description: err.message, variant: "destructive" });
    },
  });

  async function handlePhotoUpload() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const url = await upload(file, `employees/${user?.username}/${Date.now()}_${file.name}`);
        await fetch(`/api/users/${user?.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoUrl: url }),
        });
        setUser({ ...user!, photoUrl: url } as any);
        toast({ title: "Photo uploaded" });
      } catch (e: any) {
        toast({ title: "Upload failed", description: e.message, variant: "destructive" });
      }
    };
    input.click();
  }

  const handleProfileSave = () => {
    profileMutation.mutate({ fullName, email });
  };

  const handlePasswordChange = () => {
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    passwordMutation.mutate({ currentPassword, newPassword });
  };

  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2);
  };

  if (!user) return null;

  return (
    <div className="space-y-6 pb-8 page-enter max-w-2xl">
      <div>
        <p className="text-muted-foreground">Manage your account information and preferences.</p>
      </div>

      <Card className="surface rounded-lg">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <Icon name="user" className="text-primary" size={20} />
            Profile Information
          </CardTitle>
          <CardDescription>Update your name, email, and photo</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-4 pb-4 border-b">
            <Avatar className="h-20 w-20 border-2 border-border">
              <AvatarImage src={(user as any).photoUrl} />
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                {getInitials(user.fullName || user.username)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-lg">{user.fullName || user.username}</p>
              <p className="text-sm text-muted-foreground">{formatRole(user.role)}{user.department ? ` • ${user.department === "Both" ? "SIS & JMCS" : user.department}` : ""}</p>
              <div className="flex items-center gap-2 mt-2">
                {hasFirebase && (
                  <Button variant="outline" size="sm" onClick={handlePhotoUpload} disabled={uploading}>
                    <Icon name="upload" className="mr-1" size={16} />
                    {uploading ? `${uploadProgress}%` : "Change Photo"}
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" value={user.username} disabled className="bg-muted/50" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Icon name="shield-check" size={16} />
            Role: <span className="font-medium">{formatRole(user.role)}</span>
            {user.department && <><span className="text-muted-foreground/50">|</span> Department: <span className="font-medium">{user.department === "Both" ? "SIS & JMCS" : user.department}</span></>}
          </div>
          <Button onClick={handleProfileSave} disabled={profileMutation.isPending}>
            <Icon name="save" className="mr-2" size={16} />
            {profileMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      <Card className="surface rounded-lg">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <Icon name="lock" className="text-primary" size={20} />
            Change Password
          </CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current Password</Label>
            <Input id="currentPassword" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          <Button onClick={handlePasswordChange} disabled={passwordMutation.isPending || !currentPassword || !newPassword}>
            <Icon name="lock" className="mr-2" size={16} />
            {passwordMutation.isPending ? "Changing..." : "Change Password"}
          </Button>
        </CardContent>
      </Card>

      <UploadProgressOverlay uploading={uploading} progress={uploadProgress} fileName={fileName} fileSize={fileSize} />
      <SaveProgressIndicator saving={profileMutation.isPending} label="Saving profile..." />
      <SaveProgressIndicator saving={passwordMutation.isPending} label="Changing password..." />
    </div>
  );
}
