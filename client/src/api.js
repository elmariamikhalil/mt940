import axios from "axios";

const API = axios.create({
  baseURL: "https://main.d151ard5f4vim3.amplifyapp.com:5000/api",
});

export default API;
