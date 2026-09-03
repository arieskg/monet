import { useEffect, useRef, useState, type ComponentProps } from "react";

type ListEditorProps = {
  value: readonly string[];
  onChange: (value: string[]) => void;
};

function parseList(value: string, separator: string): string[] {
  return value.split(separator).map((item) => item.trim()).filter(Boolean);
}

function useListEditor(value: readonly string[], onChange: (value: string[]) => void, separator: string) {
  const formatted = value.join(separator === "," ? ", " : separator);
  const [draft, setDraft] = useState(formatted);
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setDraft(formatted);
  }, [formatted]);

  function update(next: string) {
    setDraft(next);
    onChange(parseList(next, separator));
  }

  function finish() {
    editing.current = false;
    const normalized = parseList(draft, separator);
    setDraft(normalized.join(separator === "," ? ", " : separator));
    onChange(normalized);
  }

  return { draft, update, start: () => { editing.current = true; }, finish };
}

type StringListInputProps = ListEditorProps & Omit<ComponentProps<"input">, "value" | "onChange">;

export function StringListInput({ value, onChange, onFocus, onBlur, ...props }: StringListInputProps) {
  const editor = useListEditor(value, onChange, ",");
  return <input {...props} value={editor.draft} onChange={(event) => editor.update(event.target.value)} onFocus={(event) => { editor.start(); onFocus?.(event); }} onBlur={(event) => { editor.finish(); onBlur?.(event); }} />;
}

type StringListTextareaProps = ListEditorProps & Omit<ComponentProps<"textarea">, "value" | "onChange">;

export function StringListTextarea({ value, onChange, onFocus, onBlur, ...props }: StringListTextareaProps) {
  const editor = useListEditor(value, onChange, "\n");
  return <textarea {...props} value={editor.draft} onChange={(event) => editor.update(event.target.value)} onFocus={(event) => { editor.start(); onFocus?.(event); }} onBlur={(event) => { editor.finish(); onBlur?.(event); }} />;
}
