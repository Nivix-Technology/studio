// @ts-expect-error Electrobun's SDK modules are provided by the build toolchain.
import { Screen } from "electrobun/bun";

const primaryScreen = Screen.getPrimaryDisplay();
const screenWidth = primaryScreen.workArea.width;
const screenHeight = primaryScreen.workArea.height;

export function getCenterXY(windowWidth = 0, windowHeight = 0) {
  const x = (screenWidth - windowWidth) / 2;
  const y = (screenHeight - windowHeight) / 2;

  return { x, y };
}