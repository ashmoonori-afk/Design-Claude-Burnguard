self.onmessage = (): void => {
  postMessage({ kind: "started" });
  while (true) {
    // Deliberately TERM-resistant parser fixture. Only Worker.terminate() can stop it.
  }
};
