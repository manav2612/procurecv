import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  message: string;
  actions?: ToastAction[];
}

interface ToastContextValue {
  toast: (message: string) => void;
  confirmToast: (message: string) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer != null) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const toast = useCallback(
    (message: string) => {
      const id = nextId++;
      setItems((prev) => [...prev, { id, message }]);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), 3500),
      );
    },
    [dismiss],
  );

  const confirmToast = useCallback(
    (message: string) =>
      new Promise<boolean>((resolve) => {
        const id = nextId++;
        const resolveAndDismiss = (result: boolean) => {
          dismiss(id);
          resolve(result);
        };
        setItems((prev) => [
          ...prev,
          {
            id,
            message,
            actions: [
              { label: "Delete", onClick: () => resolveAndDismiss(true) },
              { label: "Cancel", onClick: () => resolveAndDismiss(false) },
            ],
          },
        ]);
      }),
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast, confirmToast }}>
      {children}
      <div className="toaster">
        {items.map((item) => (
          <div className="toast" key={item.id}>
            <span>{item.message}</span>
            {item.actions ? (
              <div className="toast-actions">
                {item.actions.map((action) => (
                  <button key={action.label} onClick={action.onClick}>
                    {action.label}
                  </button>
                ))}
              </div>
            ) : (
              <button className="toast-close" onClick={() => dismiss(item.id)} aria-label="Dismiss">
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
