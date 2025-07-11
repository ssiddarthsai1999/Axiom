// utils/getBaseUrl.js

export function getBaseUrl() {
    return process.env.NEXT_PUBLIC_NODE_ENV === "production"
        ? process.env.NEXT_PUBLIC_PROD_URL
        : process.env.NEXT_PUBLIC_LOCAL_URL;
}