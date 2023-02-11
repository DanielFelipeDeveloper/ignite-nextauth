import { signOut } from "@/contexts/AuthContext";
import axios, { AxiosError } from "axios";
import { parseCookies, setCookie } from "nookies";

let cookies = parseCookies();
let isRefreshing = false;

type FailedRequestsQueueData = {
  onSuccess: (token: string) => void;
  onFailure: (err: AxiosError) => void;
}

let failedRequestsQueue: FailedRequestsQueueData[] = [];

type ErrorResponseData = {
  code: string;
}

export const api = axios.create({
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
      cookies = parseCookies();

      const { 'nextauth.refreshToken': refreshToken } = cookies;
      const originalConfig = error.config;

      if (!isRefreshing) {
        isRefreshing = true;

        api.post('/refresh', {
          refreshToken
        }).then(response => {
          const { token, refreshToken: newRefreshToken } = response.data;
  
          setCookie(undefined, 'nextauth.token', token, {
            maxAge: 60 * 60 * 24 * 30, // 30 day
            path: '/'
          });
    
          setCookie(undefined, 'nextauth.refreshToken', newRefreshToken, {
            maxAge: 60 * 60 * 24 * 30, // 30 day
            path: '/'
          });

          failedRequestsQueue.forEach(request => request.onSuccess(token));
          failedRequestsQueue = [];
        }).catch(err => {
          failedRequestsQueue.forEach(request => request.onFailure(err));
          failedRequestsQueue = [];
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
      signOut();
    }
  }

  return Promise.reject(error);
});
