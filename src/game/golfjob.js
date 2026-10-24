// Mission 6, « N'importe quelle petite clé » (id 'golfcart'): the night Sayyad
// proved any small key starts a golf cart. It replaced « Le cart du Club »,
// the pro-shop errand to École de l'Aigle, on 29 Sept.
//
// The mission itself lives in setpieces/golfnuit.js and the reusable cart
// machinery (runtime ramps, checkpoint chain, airtime, governor, swap in and
// back) in setpieces/cartkit.js. This file keeps the export missions.js reads.
import { golfnuit } from './setpieces/golfnuit.js';

export const golfjob = golfnuit;
export const GOLF_MISSIONS = [golfnuit];
