import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Native modality keeps focus inside the surface and the rest of the page inert. */
export function Modal({ className, label, labelledBy, onClose, children }: {
  className: string;
  label?: string;
  labelledBy?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  return <dialog ref={ref} className={`modal-backdrop ${className}`} aria-label={label} aria-labelledby={labelledBy}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    {children}
  </dialog>;
}
