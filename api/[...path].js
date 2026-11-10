import serverlessModule from '../backend/dist/serverless.js';
const handler = serverlessModule.default || serverlessModule;
export default handler;
