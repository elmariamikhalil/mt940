import axios from "axios";

const API = axios.create({
  baseURL: "https://13.39.246.230:5000/api",
});

export default API;
