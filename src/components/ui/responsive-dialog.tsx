import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

type RootProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
};

export function ResponsiveDialog({ open, onOpenChange, children }: RootProps) {
  const isMobile = useIsMobile();
  const Cmp: any = isMobile ? Drawer : Dialog;
  return (
    <Cmp open={open} onOpenChange={onOpenChange}>
      {children}
    </Cmp>
  );
}

export const ResponsiveDialogTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof DialogTrigger>
>((props, ref) => {
  const isMobile = useIsMobile();
  const Cmp: any = isMobile ? DrawerTrigger : DialogTrigger;
  return <Cmp ref={ref} {...props} />;
});
ResponsiveDialogTrigger.displayName = "ResponsiveDialogTrigger";

export const ResponsiveDialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DialogContent>
>(({ className, children, ...props }, ref) => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <DrawerContent
        ref={ref as any}
        className={cn("max-h-[92vh] px-4 pb-6", className)}
        {...(props as any)}
      >
        <div className="overflow-y-auto overflow-x-hidden pt-2">{children}</div>
      </DrawerContent>
    );
  }
  return (
    <DialogContent ref={ref} className={className} {...props}>
      {children}
    </DialogContent>
  );
});
ResponsiveDialogContent.displayName = "ResponsiveDialogContent";

export const ResponsiveDialogHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = (props) => {
  const isMobile = useIsMobile();
  return isMobile ? <DrawerHeader {...props} /> : <DialogHeader {...props} />;
};

export const ResponsiveDialogFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = (props) => {
  const isMobile = useIsMobile();
  return isMobile ? <DrawerFooter {...props} /> : <DialogFooter {...props} />;
};

export const ResponsiveDialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof DialogTitle>
>((props, ref) => {
  const isMobile = useIsMobile();
  const Cmp: any = isMobile ? DrawerTitle : DialogTitle;
  return <Cmp ref={ref} {...props} />;
});
ResponsiveDialogTitle.displayName = "ResponsiveDialogTitle";

export const ResponsiveDialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof DialogDescription>
>((props, ref) => {
  const isMobile = useIsMobile();
  const Cmp: any = isMobile ? DrawerDescription : DialogDescription;
  return <Cmp ref={ref} {...props} />;
});
ResponsiveDialogDescription.displayName = "ResponsiveDialogDescription";
