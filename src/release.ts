import { version } from "../package.json";
export const appVersion = version;
export const releaseCommit = import.meta.env.VITE_RELEASE_COMMIT || "local";
