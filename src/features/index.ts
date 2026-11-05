import type { Map } from "maplibre-gl";
import addressClick from "./address-click";

// One file per feature. Add yours here (one line).
export const features: ((map: Map) => void)[] = [addressClick];
