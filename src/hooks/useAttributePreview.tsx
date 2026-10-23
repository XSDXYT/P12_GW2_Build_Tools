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
  type Preview,
} from "../attributes";
import type { Build, Catalog } from "../domain";
import type { Attunement } from "../weapon-skills";
import { emptyMechanicPreview } from "../profession-mechanics";

function usePreview(build: Build, catalog: Catalog) {
  const [data, setData] = useState<AttributeData | null>(null);
  const [error, setError] = useState(false);
  const [storedPreview, setPreview] = useState(emptyPreview);
  const [storedWeaponSet, onWeaponSet] = useState<1 | 2>(1);
  const [storedAttunement, setAttunement] = useState<Attunement>("Fire");
  const [secondaryAttunement, onSecondaryAttunement] =
    useState<Attunement>("Fire");
  const [mechanicPreview, onMechanicPreview] = useState(emptyMechanicPreview);
  const lockedAttunement =
    build.profession === "Elementalist" &&
    build.specs.some((s) => s.id === 80 && s.traits.includes(2437))
      ? build.mechanics?.familiar || "Fire"
      : null;
  const attunement: Attunement = lockedAttunement || storedAttunement;
  function onAttunement(value: Attunement) {
    if (!lockedAttunement || value === lockedAttunement) setAttunement(value);
  }
  const key = `${build.id}:${build.profession}`;
  const [owner, setOwner] = useState(key);
  const mechanicKey = `${key}:${build.specs.map((s) => s.id).join(",")}`;
  const [mechanicOwner, setMechanicOwner] = useState(mechanicKey);
  // Specialization changes reset mechanism state without clearing shared boons.
  if (mechanicOwner !== mechanicKey) {
    setMechanicOwner(mechanicKey);
    onMechanicPreview(emptyMechanicPreview());
  }
  // Reset before rendering another build so its tooltip cannot use stale conditions.
  if (owner !== key) {
    setOwner(key);
    setPreview(emptyPreview());
    onWeaponSet(1);
    setAttunement("Fire");
    onSecondaryAttunement("Fire");
  }
  const preview = useMemo<Preview>(() => {
    const value = owner === key ? storedPreview : emptyPreview();
    const linked: Preview = {
      ...value,
      flags: { ...value.flags, soulbeastMerged: mechanicPreview.transformed },
      stacks: { ...value.stacks, activePet: mechanicPreview.activePet },
    };
    return build.profession === "Elementalist"
      ? {
          ...linked,
          flags: {
            ...value.flags,
            fire: attunement === "Fire",
            air: attunement === "Air",
          },
        }
      : linked;
  }, [
    owner,
    key,
    storedPreview,
    build.profession,
    attunement,
    mechanicPreview,
  ]);
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
    mechanicPreview,
    onMechanicPreview,
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
