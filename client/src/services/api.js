import axios from 'axios'

const configuredApiUrl =
  import.meta.env.VITE_API_URL ??
  import.meta.env.VITE_API_BASE_URL
const apiBaseUrl =
  configuredApiUrl?.trim().replace(/\/+$/, '') ||
  (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api')

export const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
})

export function getApiErrorMessage(error, fallbackMessage) {
  return error.response?.data?.message ?? fallbackMessage
}
