import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/src/data/wiki/"))
            return "wiki-" + id.split("/").at(-1)!.replace(".json", "");
        },
      },
    },
  },
});
