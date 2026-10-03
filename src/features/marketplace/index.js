// @ts-check
/* Marketplace sources: subscriptions to market.json catalogues and ad hoc
   listings, fetched, validated and cached.

   This file is the feature's public API: code outside src/features/marketplace/
   imports it only from here (eslint.config.js enforces that). */

export {adhocCache, childMarketFolders, listingsInFolder, loadListing, marketFolderDescendant, marketFolderOf, marketFolderPath} from './adhoc-folders.js';
export {ensureDefaultMarket, fetchMarketItem, loadRegistry, marketIndexCache, reloadMarketSub, removeMarketSub, subscribeMarket} from './market-subs.js';
