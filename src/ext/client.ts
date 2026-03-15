(() => {
  interface IWindow extends Window {
    lute?: boolean;
  }

  // add lute if it doesn't exist
  if (!(window as IWindow).lute) {
    (window as IWindow).lute = true;
  }
})();
