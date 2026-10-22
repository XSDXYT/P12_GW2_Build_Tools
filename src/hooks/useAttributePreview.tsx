import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  calculateAttributes,
  emptyPreview,
  type AttributeData,
} from "../attributes";
import type { Build, Catalog } from "../domain";
import type { Attunement } from "../weapon-skills";

function usePreview(build: Build, catalog: Catalog) {
  const [data, setData] = useState<AttributeData | null>(null);
  const [error, setError] = useState(false);
  const [storedPreview, setPreview] = useState(emptyPreview);
  const [storedWeaponSet, onWeaponSet] = useState<1 | 2>(1);
  const [attunement, onAttunement] = useState<Attunement>("Fire");
  const [secondaryAttunement, onSecondaryAttunement] =
    useState<Attunement>("Fire");
  const [owner, setOwner] = useState(`${build.id}:${build.profession}`);
  const key = `${build.id}:${build.profession}`;
  // Reset before rendering another build so its tooltip cannot use stale conditions.
  if (owner !== key) {
    setOwner(key);
    setPreview(emptyPreview());
    onWeaponSet(1);
    onAttunement("Fire");
    onSecondaryAttunement("Fire");
  }
  const preview = useMemo(() => {
    const value = owner === key ? storedPreview : emptyPreview();
    return build.profession === "Elementalist"
      ? {
          ...value,
          flags: {
            ...value.flags,
            fire: attunement === "Fire",
            air: attunement === "Air",
          },
        }
      : value;
  }, [owner, key, storedPreview, build.profession, attunement]);
  const weaponSet: 1 | 2 =
    owner === key && storedWeaponSet === 2 && build.equipment.weapon2.weapon
      ? 2
      : 1;
  useEffect(() => {
    if (storedWeaponSet === 2 && !build.equipment.weapon2.weapon)
      onWeaponSet(1);
  }, [storedWeaponSet, build.equipment.weapon2.weapon]);
  async function load() {
    setError(false);
    try {
      const response = await fetch("./attribute-data.json", {
        cache: "no-store",
      });
      if (!response.ok) throw Error();
      const value = await response.json();
      if (!value.profiles?.head || !value.items) throw Error();
      setData(value);
    } catch {
      setError(true);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const baseline = useMemo(
    () => (data ? calculateAttributes(build, catalog, data, weaponSet) : null),
    [build, catalog, data, weaponSet],
  );
  const result = useMemo(
    () =>
      data
        ? calculateAttributes(build, catalog, data, weaponSet, preview)
        : null,
    [build, catalog, data, weaponSet, preview],
  );
  return {
    build,
    error,
    load,
    preview,
    setPreview,
    weaponSet,
    onWeaponSet,
    attunement,
    onAttunement,
    secondaryAttunement,
    onSecondaryAttunement,
    baseline,
    result,
  };
}
const PreviewContext = createContext<ReturnType<typeof usePreview> | null>(
  null,
);
export function AttributePreviewProvider({
  build,
  catalog,
  children,
}: {
  build: Build;
  catalog: Catalog;
  children: ReactNode;
}) {
  const value = usePreview(build, catalog);
  return (
    <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>
  );
}
export function useAttributePreview() {
  const value = useContext(PreviewContext);
  if (!value) throw Error("Attribute preview provider is missing");
  return value;
}
