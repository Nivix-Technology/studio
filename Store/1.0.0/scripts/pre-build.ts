import { cpSync } from "node:fs";

cpSync("src/libraries/sheets", "src/store/sheets", { recursive: true });
cpSync("src/libraries/sheets", "src/updater/sheets", { recursive: true });