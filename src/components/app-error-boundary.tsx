import React from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[AppErrorBoundary] render failure", error);
  }

  handleResetSave = () => {
    try {
      window.localStorage.removeItem("propertyTycoonSave");
    } catch {
      // noop
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Game save needs recovery</h1>
            <p className="text-sm text-muted-foreground">
              Your saved game data looks corrupted. Resetting the local save should get the game loading again.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button onClick={this.handleResetSave}>Reset saved game</Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reload first
            </Button>
          </div>
        </div>
      </main>
    );
  }
}