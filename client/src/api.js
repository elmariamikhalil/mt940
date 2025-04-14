import axios from "axios";

const API = axios.create({
  baseURL: "https://graphtsy.org:5000/api",
});

export default API;
