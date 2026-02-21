import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { connectToDatabase } from "@/lib/mongodb";
import User from "@/models/User";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Mail, User as UserIcon } from "lucide-react";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id: string })?.id;

  await connectToDatabase();
  const user = await User.findById(userId).lean();

  if (!user) return <p>User not found.</p>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Profile</h1>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <UserIcon className="h-8 w-8 text-primary" />
            </div>
            <div>
              <CardTitle>{user.name}</CardTitle>
              <CardDescription className="flex items-center gap-1 mt-1">
                <Mail className="h-3 w-3" />
                {user.email}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Major</p>
              <p className="text-sm font-medium">{user.major}</p>
            </div>
            {user.minor && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Minor</p>
                <p className="text-sm font-medium">{user.minor}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Class Year</p>
              <p className="text-sm font-medium">{user.currentYear}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Graduation</p>
              <p className="text-sm font-medium flex items-center gap-1">
                <GraduationCap className="h-3.5 w-3.5" />
                {user.graduationYear}
              </p>
            </div>
          </div>

          {user.bio && (
            <div className="border-t pt-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Bio</p>
              <p className="text-sm">{user.bio}</p>
            </div>
          )}

          {user.careerInterests.length > 0 && (
            <div className="border-t pt-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Career Interests</p>
              <div className="flex flex-wrap gap-2">
                {user.careerInterests.map((interest) => (
                  <Badge key={interest} variant="secondary">{interest}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
