import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Briefcase, TrendingUp, Users } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Nav */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold text-primary">MakeItSo</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="container py-24 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-gray-900 mb-6">
          Plan your degree.
          <br />
          <span className="text-primary">Launch your career.</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
          MakeItSo helps Davidson students map out their entire academic journey — from course
          selection to career milestones — all in one place.
        </p>
        <div className="flex gap-4 justify-center">
          <Button size="lg" asChild>
            <Link href="/register">Start Planning Free</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">Sign In</Link>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="container py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Everything you need to succeed</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <BookOpen className="h-10 w-10 text-primary mb-2" />
              <CardTitle className="text-lg">Course Planning</CardTitle>
              <CardDescription>
                Build your 4-year schedule semester by semester, track prerequisites, and manage credits.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <TrendingUp className="h-10 w-10 text-primary mb-2" />
              <CardTitle className="text-lg">Degree Progress</CardTitle>
              <CardDescription>
                Visualize how far you&apos;ve come and what&apos;s left to complete your degree requirements.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Briefcase className="h-10 w-10 text-primary mb-2" />
              <CardTitle className="text-lg">Career Goals</CardTitle>
              <CardDescription>
                Set career targets, track skills, and build a milestone roadmap toward your dream job.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Users className="h-10 w-10 text-primary mb-2" />
              <CardTitle className="text-lg">Built for Students</CardTitle>
              <CardDescription>
                Designed for Davidson students with your specific major tracks and requirements in mind.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-16 text-center">
        <Card className="max-w-xl mx-auto bg-primary text-primary-foreground border-none">
          <CardContent className="pt-8 pb-8">
            <h3 className="text-2xl font-bold mb-3">Ready to make it happen?</h3>
            <p className="mb-6 opacity-90">
              Join students who are planning smarter and graduating with purpose.
            </p>
            <Button variant="secondary" size="lg" asChild>
              <Link href="/register">Create Your Free Account</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>MakeItSo — hack@DAVIDSON 2024 · Built with Next.js, MongoDB, and Vercel</p>
      </footer>
    </div>
  );
}
