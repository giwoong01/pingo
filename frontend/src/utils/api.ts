import React from 'react';
import Cookies from 'js-cookie';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

let tokenCache: string | undefined = undefined;

export const setAccessToken = (token: string | undefined) => {
  tokenCache = token;
  if (token) {
    Cookies.set('access_token', token, { expires: 7 });
  } else {
    Cookies.remove('access_token');
  }
};

async function handleResponse(response: Response) {
  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    if (response.status === 401) {
    }
    const error = (data && data.message) || response.statusText;
    return Promise.reject(error);
  }
  return data;
}

export const api = {
  get: async (path: string) => {
    const token = tokenCache || Cookies.get('access_token');
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return handleResponse(response);
  },
  post: async (path: string, body: any) => {
    const token = tokenCache || Cookies.get('access_token');
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return handleResponse(response);
  },
  patch: async (path: string, body: any) => {
    const token = tokenCache || Cookies.get('access_token');
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return handleResponse(response);
  },
  put: async (path: string, body: any) => {
    const token = tokenCache || Cookies.get('access_token');
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return handleResponse(response);
  },
  delete: async (path: string) => {
    const token = tokenCache || Cookies.get('access_token');
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return handleResponse(response);
  },
};
