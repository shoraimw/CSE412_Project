declare module 'serverless-http' {
  import { IncomingMessage, ServerResponse } from 'http';
  type Handler = (event: IncomingMessage, response: ServerResponse) => Promise<void>;
  function serverless(app: any, options?: any): Handler;
  export default serverless;
}
