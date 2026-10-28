import { configureStore, createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { useDispatch, useSelector, useStore } from "react-redux";
import type { HistoryItem, Metrics, Prediction, Sample, RecognitionMode } from "./types";

async function request<T>(path:string, body?:unknown):Promise<T> {
  const response = await fetch(`/api/${path}`, {method:body ? "POST" : "GET", headers:body ? {"Content-Type":"application/json"} : undefined, body:body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(35000)});
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : `Request failed (${response.status}). Please try again.`);
  return data;
}
export const loadLab = createAsyncThunk("lab/load", async () => {
  const [metrics,samples] = await Promise.all([request<Metrics>("metrics"), request<Sample[]>("samples")]);
  return {metrics,samples};
});
export const recognize = createAsyncThunk("lab/recognize", async (input:{image:string; source:string; expected?:string; mode:RecognitionMode}) => {
  const result = await request<Prediction>("predict",{image:input.image,mode:input.mode});
  return {...result,...input,id:crypto.randomUUID(),timestamp:new Date().toISOString()} as HistoryItem;
});
interface LabState {
  characterType:RecognitionMode;
  tab:"studio"|"lab"|"history"; metrics:Metrics|null; samples:Sample[]; result:HistoryItem|null; history:HistoryItem[];
  status:"idle"|"loading"; loading:boolean; error:string|null; connectionError:string|null;
}
const initialState:LabState = {characterType:"all",tab:"studio",metrics:null,samples:[],result:null,history:[],status:"idle",loading:true,error:null,connectionError:null};
const labSlice = createSlice({name:"lab",initialState,reducers:{
  setCharacterType(state,action:PayloadAction<RecognitionMode>){state.characterType=action.payload},
  setTab(state,action:PayloadAction<LabState["tab"]>){state.tab=action.payload},
  clearResult(state){state.result=null;state.error=null},
  clearHistory(state){state.history=[]},
  restoreHistory(state,action:PayloadAction<HistoryItem[]>){state.history=action.payload.slice(0,50)},
},extraReducers(builder){builder
  .addCase(loadLab.pending,state=>{state.loading=true;state.connectionError=null})
  .addCase(loadLab.fulfilled,(state,action)=>{state.metrics=action.payload.metrics;state.samples=action.payload.samples;state.loading=false})
  .addCase(loadLab.rejected,(state,action)=>{state.connectionError=action.error.message || "Could not connect to the model.";state.loading=false})
  .addCase(recognize.pending,state=>{state.status="loading";state.error=null;state.result=null})
  .addCase(recognize.fulfilled,(state,action)=>{state.status="idle";state.result=action.payload;state.history.unshift(action.payload);state.history=state.history.slice(0,50)})
  .addCase(recognize.rejected,(state,action)=>{state.status="idle";state.error=action.error.message || "Recognition failed."});
}});
export const { setTab,clearResult,clearHistory,restoreHistory,setCharacterType } = labSlice.actions;
export const makeStore=()=>configureStore({reducer:{lab:labSlice.reducer}});
export type AppStore=ReturnType<typeof makeStore>;
export type RootState=ReturnType<AppStore["getState"]>;
export type AppDispatch=AppStore["dispatch"];
export const useAppDispatch=useDispatch.withTypes<AppDispatch>();
export const useAppSelector=useSelector.withTypes<RootState>();
export const useAppStore=useStore.withTypes<AppStore>();
