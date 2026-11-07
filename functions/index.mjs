import {onRequest} from 'firebase-functions/v2/https';
import {handleApi} from './api.mjs';
export const api=onRequest({region:'us-central1',timeoutSeconds:30,maxInstances:5},handleApi);
