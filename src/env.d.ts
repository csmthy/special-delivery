declare module '*.css';
declare module '*.mp3?inline' {
  const dataUrl: string;
  export default dataUrl;
}
