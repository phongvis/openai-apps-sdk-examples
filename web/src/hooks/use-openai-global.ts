import { useSyncExternalStore } from "react";
import {
  SET_GLOBALS_EVENT_TYPE,
  SetGlobalsEvent,
  type OpenAiGlobals,
} from "../types";

console.log("%c🪝 use-openai-global.ts loaded", "color: #2196F3; font-weight: bold");

export function useOpenAiGlobal<K extends keyof OpenAiGlobals>(
  key: K
): OpenAiGlobals[K] | null {
  console.log(`%c🪝 useOpenAiGlobal('${key}') called`, "color: #2196F3", {
    "window.openai": window.openai,
    [`window.openai.${key}`]: window.openai?.[key],
  });
  
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined") {
        console.log("%c🪝 useOpenAiGlobal: window undefined (SSR)", "color: #2196F3");
        return () => {};
      }

      const handleSetGlobal = (event: SetGlobalsEvent) => {
        console.log("%c🪝 SET_GLOBALS event received!", "color: #4CAF50; font-weight: bold", event.detail);
        const value = event.detail.globals[key];
        if (value === undefined) {
          console.log(`%c🪝 Key '${key}' not in event, ignoring`, "color: #FF9800");
          return;
        }

        console.log(`%c🪝 Key '${key}' found in event, triggering update`, "color: #4CAF50", value);
        onChange();
      };

      console.log(`%c🪝 Adding listener for ${SET_GLOBALS_EVENT_TYPE}`, "color: #2196F3");
      window.addEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal, {
        passive: true,
      });

      return () => {
        console.log(`%c🪝 Removing listener for ${SET_GLOBALS_EVENT_TYPE}`, "color: #2196F3");
        window.removeEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal);
      };
    },
    () => window.openai?.[key] ?? null,
    () => window.openai?.[key] ?? null
  );
}
