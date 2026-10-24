import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      closeButton={false}
      gap={10}
      expand
      visibleToasts={4}

      duration={4200}
      toastOptions={{
        classNames: {
          // The ticket itself paints its own background/border, so the sonner
          // wrapper is stripped down to a plain slot.
          toast: "comanda-wrap",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
