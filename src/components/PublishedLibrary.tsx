import { useEffect, useRef, useState } from "react";
import { readCollection, type PublishedCollection } from "../collection";
import { BuildArchive } from "./BuildArchive";
const emptyEntries: PublishedCollection["builds"] = [];

export function PublishedLibrary({
  close,
  open,
}: {
  close: () => void;
  open: (id: string) => Promise<boolean>;
}) {
  const [collection, setCollection] = useState<PublishedCollection | null>(
    null,
  );
  const [error, setError] = useState("");
  const alive = useRef(true);
  async function load() {
    setError("");
    try {
      const value = await readCollection();
      if (alive.current) setCollection(value);
    } catch {
      if (alive.current)
        setError("展示目录读取失败，请重试。你的本地配装仍保留。");
    }
  }
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, []);
  return (
    <BuildArchive
      source="published"
      entries={collection?.builds || emptyEntries}
      ready={!!collection}
      error={error}
      reload={() => void load()}
      close={close}
      open={open}
    />
  );
}
