import { signOut } from "@/contexts/AuthContext";
import axios, { AxiosError } from "axios";
import { parseCookies, setCookie } from "nookies";
import { AuthTokenError } from "./errors/AuthTokenError";

type FailedRequestsQueueData = {
  onSuccess: (token: string) => void;
  onFailure: (err: AxiosError) => void;
}

type ErrorResponseData = {
  code: string;
}

let isRefreshing = false;
let failedRequestsQueue: FailedRequestsQueueData[] = [];

export function setupAPIClient(ctx = undefined) {
  let cookies = parseCookies(ctx);
  
  
  const api = axios.create({
    baseURL: 'http://localhost:3333',
    headers: {
      Authorization: `Bearer ${cookies['nextauth.token']}`
    }
  });
  
  api.interceptors.response.use(success => {
    return success;
  }, (error: AxiosError<ErrorResponseData>) => {
    if (error.response?.status === 401) {
      if (error.response.data?.code === 'token.expired') {
        cookies = parseCookies(ctx);
  
        const { 'nextauth.refreshToken': refreshToken } = cookies;
        const originalConfig = error.config;
  
        if (!isRefreshing) {
          isRefreshing = true;
  
          api.post('/refresh', {
            refreshToken
          }).then(response => {
            const { token, refreshToken: newRefreshToken } = response.data;
    
            setCookie(ctx, 'nextauth.token', token, {
              maxAge: 60 * 60 * 24 * 30, // 30 day
              path: '/'
            });
      
            setCookie(ctx, 'nextauth.refreshToken', newRefreshToken, {
              maxAge: 60 * 60 * 24 * 30, // 30 day
              path: '/'
            });
  
            failedRequestsQueue.forEach(request => request.onSuccess(token));
            failedRequestsQueue = [];
          }).catch(err => {
            failedRequestsQueue.forEach(request => request.onFailure(err));
            failedRequestsQueue = [];
  
            if (process.browser) signOut();
          }).finally(() => {
            isRefreshing = false;
          });
        }
       
        return new Promise((resolve, reject) => {
          failedRequestsQueue.push({
            onSuccess: (token: string) => {
              originalConfig.headers['Authorization'] = `Bearer ${token}`;
  
              resolve(api(originalConfig));
            },
            onFailure: (err: AxiosError) => {
              reject(err);
            },
          })
        });
      } else {
        if (process.browser) {
          signOut();
        } else {
          return Promise.reject(new AuthTokenError());
        }
      }
    }
  
    return Promise.reject(error);
  });
  
  return api;
}