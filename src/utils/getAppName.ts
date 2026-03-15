export default function getAppName() {
  return (
    document
      .querySelector('meta[name="application-name"]')
      ?.getAttribute("content") || document.title
  );
}
