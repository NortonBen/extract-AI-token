declare function defineBackground(main: () => void): unknown;

declare function defineContentScript(config: {
  matches: string[];
  main: () => void;
}): unknown;
