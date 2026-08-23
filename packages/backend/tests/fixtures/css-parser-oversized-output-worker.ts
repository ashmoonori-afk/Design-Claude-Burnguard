self.onmessage = (): void => {
  postMessage({
    kind: "result",
    result: {
      declarations: [{ property: "--fixture", value: "x".repeat(512), sourceLocator: "fixture.css:1:1", fileOrder: 0, declarationOrder: 1, parseStatus: "observed" }],
      issues: [],
    },
  });
  close();
};
