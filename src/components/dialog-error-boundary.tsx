import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: React.ReactNode;
  onClose?: () => void;
}

interface State {
  hasError: boolean;
}

/**
 * Dialog-scoped error boundary. Catches render errors inside complex
 * dialogs / panels so one crash doesn't bring down the whole app.
 */
export class DialogErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    console.error("[DialogErrorBoundary] render failure", error, errorInfo);
  }

  handleClose = () => {
    if (this.props.onClose) {
      this.props.onClose();
    } else {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="glass rounded-2xl p-6 max-w-sm mx-auto my-4 text-center space-y-4 animate-fade-in">
        <AlertTriangle className="h-8 w-8 mx-auto text-amber-400" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            Something went wrong loading this
          </p>
          <p className="text-xs text-muted-foreground">
            Please close and try again
          </p>
        </div>
        <Button size="sm" onClick={this.handleClose}>
          Close
        </Button>
      </div>
    );
  }
}
