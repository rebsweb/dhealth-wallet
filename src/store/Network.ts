/*
 * Copyright 2020 NEM (https://nem.io)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and limitations under the License.
 *
 */
import { feesConfig, networkConfig } from '@/config';
import { NetworkConfigurationModel } from '@/core/database/entities/NetworkConfigurationModel';
import { NetworkModel } from '@/core/database/entities/NetworkModel';
import { NodeModel } from '@/core/database/entities/NodeModel';
import { ProfileModel } from '@/core/database/entities/ProfileModel';
import { CommonHelpers } from '@/core/utils/CommonHelpers';
import { NotificationType } from '@/core/utils/NotificationType';
import { URLHelpers } from '@/core/utils/URLHelpers';
import { URLInfo } from '@/core/utils/URLInfo';
// configuration
import { UrlValidator } from '@/core/validation/validators';
import app from '@/main';
import { NetworkService } from '@/services/NetworkService';
import { NodeService } from '@/services/NodeService';
import { ProfileService } from '@/services/ProfileService';
import _ from 'lodash';
import { Subscription } from 'rxjs';
import {
    BlockInfo,
    IListener,
    Listener,
    NetworkType,
    NodeInfo,
    RentalFees,
    RepositoryFactory,
    RepositoryFactoryHttp,
    TransactionFees,
} from 'symbol-sdk';
import Vue from 'vue';
// internal dependencies
import { $eventBus } from '../events';
import { AwaitLock } from './AwaitLock';
const Lock = AwaitLock.create();

/// region custom types
/**
 * Type SubscriptionType for Wallet Store
 * @type {SubscriptionType}
 */
type SubscriptionType = {
    listener: IListener | undefined;
    subscriptions: Subscription[];
};

/**
 * Type BlockRangeType for Wallet Store
 * @type {BlockRangeType}
 */
type BlockRangeType = { start: number };

/// end-region custom types

export interface ConnectingToNodeInfo {
    isTryingToConnect: boolean;
    tryingToConnectNodeUrl?: string;
    progressCurrentNodeIndex?: number;
    progressTotalNumOfNodes?: number;
    attemps?: number;
}

interface NetworkState {
    initialized: boolean;
    currentPeer: URLInfo;
    currentPeerInfo: NodeModel;
    networkModel: NetworkModel;
    networkConfiguration: NetworkConfigurationModel;
    repositoryFactory: RepositoryFactory;
    listener: Listener;
    generationHash: string;
    networkType: NetworkType;
    epochAdjustment: number;
    isConnected: boolean;
    knowNodes: NodeModel[];
    currentHeight: number;
    subscriptions: Subscription[];
    transactionFees: TransactionFees;
    rentalFeeEstimation: RentalFees;
    networkIsNotMatchingProfile: boolean;
    peerNodes: NodeInfo[];
    harvestingPeerNodes: NodeInfo[];
    connectingToNodeInfo: ConnectingToNodeInfo;
    isOfflineMode: boolean;
    feesConfig: any;
}

const initialNetworkState: NetworkState = {
    initialized: false,
    currentPeer: undefined,
    currentPeerInfo: undefined,
    networkType: undefined,
    generationHash: undefined,
    networkModel: undefined,
    networkConfiguration: undefined,
    repositoryFactory: undefined,
    listener: undefined,
    transactionFees: undefined,
    isConnected: false,
    knowNodes: [],
    currentHeight: 0,
    subscriptions: [],
    rentalFeeEstimation: undefined,
    epochAdjustment: undefined,
    networkIsNotMatchingProfile: false,
    peerNodes: [],
    harvestingPeerNodes: [],
    connectingToNodeInfo: undefined,
    isOfflineMode: false,
    feesConfig: undefined,
};

export default {
    namespaced: true,
    state: initialNetworkState,
    getters: {
        getInitialized: (state: NetworkState) => state.initialized,
        subscriptions: (state: NetworkState) => state.subscriptions,
        networkType: (state: NetworkState) => state.networkType,
        epochAdjustment: (state: NetworkState) => state.epochAdjustment,
        generationHash: (state: NetworkState) => state.generationHash,
        repositoryFactory: (state: NetworkState) => state.repositoryFactory,
        listener: (state: NetworkState) => state.listener,
        networkModel: (state: NetworkState) => state.networkModel,
        networkConfiguration: (state: NetworkState) => state.networkConfiguration,
        currentPeer: (state: NetworkState) => state.currentPeer,
        currentPeerInfo: (state: NetworkState) => state.currentPeerInfo,
        isConnected: (state: NetworkState) => state.isConnected,
        knowNodes: (state: NetworkState) => state.knowNodes,
        currentHeight: (state: NetworkState) => state.currentHeight,
        transactionFees: (state: NetworkState) => state.transactionFees,
        rentalFeeEstimation: (state: NetworkState) => state.rentalFeeEstimation,
        networkIsNotMatchingProfile: (state: NetworkState) => state.networkIsNotMatchingProfile,
        peerNodes: (state: NetworkState) => state.peerNodes,
        harvestingPeerNodes: (state: NetworkState) => state.harvestingPeerNodes,
        connectingToNodeInfo: (state: NetworkState) => state.connectingToNodeInfo,
        isOfflineMode: (state: NetworkState) => state.isOfflineMode,
        feesConfig: (state: NetworkState) => state.feesConfig,
    },
    mutations: {
        setInitialized: (state: NetworkState, initialized: boolean) => {
            state.initialized = initialized;
        },
        setConnected: (state: NetworkState, connected: boolean) => {
            state.isConnected = connected;
        },
        setOfflineMode: (state: NetworkState, isOfflineMode: boolean) => {
            state.isOfflineMode = isOfflineMode;
        },
        currentHeight: (state: NetworkState, currentHeight: number) => Vue.set(state, 'currentHeight', currentHeight),
        currentPeerInfo: (state: NetworkState, currentPeerInfo: NodeModel) => Vue.set(state, 'currentPeerInfo', currentPeerInfo),
        repositoryFactory: (state: NetworkState, repositoryFactory: RepositoryFactory) =>
            Vue.set(state, 'repositoryFactory', repositoryFactory),
        networkConfiguration: (state: NetworkState, networkConfiguration: NetworkConfigurationModel) =>
            Vue.set(state, 'networkConfiguration', networkConfiguration),
        listener: (state: NetworkState, listener: Listener) => Vue.set(state, 'listener', listener),
        networkModel: (state: NetworkState, networkModel: NetworkModel) => Vue.set(state, 'networkModel', networkModel),
        knowNodes: (state: NetworkState, knowNodes: NodeModel[]) => Vue.set(state, 'knowNodes', knowNodes),
        generationHash: (state: NetworkState, generationHash: string) => Vue.set(state, 'generationHash', generationHash),
        networkType: (state: NetworkState, networkType: NetworkType) => Vue.set(state, 'networkType', networkType),
        epochAdjustment: (state: NetworkState, epochAdjustment: number) => Vue.set(state, 'epochAdjustment', epochAdjustment),
        currentPeer: (state: NetworkState, currentPeer: URLInfo) => Vue.set(state, 'currentPeer', currentPeer),
        transactionFees: (state: NetworkState, transactionFees: TransactionFees) => {
            state.transactionFees = transactionFees;
        },
        rentalFeeEstimation: (state: NetworkState, amount: RentalFees) => {
            state.rentalFeeEstimation = amount;
        },
        networkIsNotMatchingProfile: (state: NetworkState, networkIsNotMatchingProfile: boolean) => {
            Vue.set(state, 'networkIsNotMatchingProfile', networkIsNotMatchingProfile);
        },

        addPeer: (state: NetworkState, peerUrl: string) => {
            const knowNodes: NodeModel[] = state.knowNodes;
            const existNode = knowNodes.find((p: NodeModel) => p.url === peerUrl);
            if (existNode) {
                return;
            }
            const newNodes = [...knowNodes, new NodeModel(peerUrl, '', false, state.networkType)];
            new NodeService().saveNodes(newNodes);
            Vue.set(state, 'knowNodes', newNodes);
        },
        removePeer: (state: NetworkState, peerUrl: string) => {
            const knowNodes: NodeModel[] = state.knowNodes;
            const toBeDeleted = knowNodes.find((p: NodeModel) => p.url === peerUrl);
            if (!toBeDeleted) {
                return;
            }
            const newNodes = knowNodes.filter((n) => n !== toBeDeleted);
            new NodeService().saveNodes(newNodes);
            Vue.set(state, 'knowNodes', newNodes);
        },
        updateNode: (state: NetworkState, node: NodeModel) => {
            const knowNodes: NodeModel[] = state.knowNodes;
            const toBeUpdated = knowNodes.find((p: NodeModel) => p.url === node.url);
            if (!toBeUpdated) {
                return;
            }
            const newNodes = knowNodes.map((n) => (n.url === node.url ? node : n));
            new NodeService().saveNodes(newNodes);
            Vue.set(state, 'knowNodes', newNodes);
        },
        subscriptions: (state: NetworkState, data) => Vue.set(state, 'subscriptions', data),
        addSubscriptions: (state: NetworkState, payload) => {
            const subscriptions = state.subscriptions;
            Vue.set(state, 'subscriptions', [...subscriptions, payload]);
        },
        peerNodes: (state: NetworkState, peerNodes: NodeInfo[]) => Vue.set(state, 'peerNodes', peerNodes),
        harvestingPeerNodes: (state: NetworkState, harvestingPeerNodes: NodeInfo[]) =>
            Vue.set(state, 'harvestingPeerNodes', harvestingPeerNodes),
        connectingToNodeInfo: (state: NetworkState, connectingToNodeInfo: ConnectingToNodeInfo) =>
            Vue.set(state, 'connectingToNodeInfo', connectingToNodeInfo),
        setFeesConfig: (state: NetworkState, feesConfig: {}) => {
            Vue.set(state, 'feesConfig', feesConfig);
        },
    },
    actions: {
        async initialize({ commit, getters }) {
            const callback = async () => {
                // commit('knowNodes', new NodeService().getKnowNodesOnly())
                //await dispatch('CONNECT');
                // update store
                commit('setInitialized', true);
            };
            // acquire async lock until initialized
            await Lock.initialize(callback, { getters });
        },
        async uninitialize({ dispatch, getters }) {
            const callback = async () => {
                dispatch('UNSUBSCRIBE');
                dispatch('RESET_STATE');
            };
            await Lock.uninitialize(callback, { getters });
        },
        RESET_STATE({ commit }) {
            commit('repositoryFactory', undefined);
            commit('currentPeer', undefined);
            commit('networkModel', undefined);
            commit('networkConfiguration', undefined);
            commit('transactionFees', undefined);
            commit('networkType', undefined);
            commit('generationHash', undefined);
            commit('knowNodes', []);
            commit('listener', undefined);
            commit('currentHeight', undefined);
            commit('currentPeerInfo', undefined);
            commit('setConnected', false);
            commit('connectingToNodeInfo', undefined);
            commit('setFeesConfig', undefined);
        },

        async CONNECT(
            { dispatch, commit, rootGetters },
            {
                newCandidateUrl,
                networkType,
                waitBetweenTrials = false,
                isOffline = false,
            }: { newCandidateUrl?: string | undefined; networkType?: NetworkType; waitBetweenTrials: boolean; isOffline: boolean },
        ) {
            const currentProfile: ProfileModel = rootGetters['profile/currentProfile'];
            const networkService = new NetworkService();
            let nodeNetworkModelResult: any;
            // if network not specified set to profile's network
            if (!networkType && currentProfile && currentProfile.networkType) {
                networkType = currentProfile.networkType;
            }

            commit('setOfflineMode', isOffline);
            if (newCandidateUrl) {
                commit('connectingToNodeInfo', {
                    isTryingToConnect: true,
                    tryingToConnectNodeUrl: newCandidateUrl,
                    progressCurrentNodeIndex: 1,
                    progressTotalNumOfNodes: 1,
                });
                nodeNetworkModelResult = await networkService.getNetworkModel(newCandidateUrl, networkType, isOffline).toPromise();
                if (
                    nodeNetworkModelResult &&
                    nodeNetworkModelResult.networkModel &&
                    nodeNetworkModelResult.networkModel.networkType === networkType
                ) {
                    await dispatch('CONNECT_TO_A_VALID_NODE', nodeNetworkModelResult);
                } else {
                    return await dispatch('notification/ADD_ERROR', NotificationType.INVALID_NODE, { root: true });
                }
                return;
            } else {
                let nodesList = [...networkConfig[networkType].nodes];
                let nodeFound = false,
                    progressCurrentNodeInx = 0;
                const numOfNodes = nodesList.length;

                // trying already saved one
                if (currentProfile && currentProfile.selectedNodeUrlToConnect) {
                    commit('connectingToNodeInfo', {
                        isTryingToConnect: true,
                        tryingToConnectNodeUrl: currentProfile.selectedNodeUrlToConnect,
                        progressCurrentNodeIndex: ++progressCurrentNodeInx,
                        progressTotalNumOfNodes: numOfNodes,
                    });
                    nodeNetworkModelResult = await networkService
                        .getNetworkModel(currentProfile.selectedNodeUrlToConnect, networkType, isOffline)
                        .toPromise();
                    if (
                        nodeNetworkModelResult &&
                        nodeNetworkModelResult.repositoryFactory &&
                        nodeNetworkModelResult.networkModel.networkType === currentProfile.networkType
                    ) {
                        await dispatch('CONNECT_TO_A_VALID_NODE', nodeNetworkModelResult);
                        nodeFound = true;
                    } else {
                        // selectedNodeUrlToConnect didn't work, let's remove it from the nodeList
                        nodesList = nodesList.filter((n) => n.url !== currentProfile.selectedNodeUrlToConnect);
                    }
                }

                // try other nodes randomly if not found yet
                while (!nodeFound && nodesList.length) {
                    const inx = Math.floor(Math.random() * nodesList.length);
                    const nodeUrl = nodesList[inx].url;
                    commit('connectingToNodeInfo', {
                        isTryingToConnect: true,
                        tryingToConnectNodeUrl: nodeUrl,
                        progressCurrentNodeIndex: ++progressCurrentNodeInx,
                        progressTotalNumOfNodes: numOfNodes,
                    });
                    nodeNetworkModelResult = await networkService.getNetworkModel(nodeUrl, networkType, isOffline).toPromise();
                    if (
                        nodeNetworkModelResult &&
                        nodeNetworkModelResult.repositoryFactory &&
                        nodeNetworkModelResult.networkModel &&
                        nodeNetworkModelResult.networkModel.networkType === networkType
                    ) {
                        await dispatch('CONNECT_TO_A_VALID_NODE', nodeNetworkModelResult);
                        nodeFound = true;
                    } else {
                        nodesList.splice(inx, 1);
                        if (waitBetweenTrials) {
                            await CommonHelpers.sleep(1000); // labor illusion
                        }
                    }
                }

                if (!nodeFound) {
                    commit('connectingToNodeInfo', {
                        isTryingToConnect: false,
                        progressCurrentNodeIndex: numOfNodes,
                        progressTotalNumOfNodes: numOfNodes,
                    });
                    await dispatch('notification/ADD_ERROR', NotificationType.NODE_CONNECTION_ERROR, { root: true });
                }
            }
        },
        async CONNECT_TO_A_VALID_NODE({ getters, commit, dispatch, rootGetters }, networkModelResult: any) {
            const currentProfile: ProfileModel = rootGetters['profile/currentProfile'];
            const { networkModel, repositoryFactory } = networkModelResult;
            const nodeService = new NodeService();
            const oldGenerationHash = getters['generationHash'];
            const networkType = networkModel.networkType;
            const getNodesPromise = nodeService.getNodes(repositoryFactory, networkModel.url, networkType).toPromise();
            const getBlockchainHeightPromise = repositoryFactory.createChainRepository().getChainInfo().toPromise();
            const nodes = await getNodesPromise;
            const currentHeight = (await getBlockchainHeightPromise).height.compact();
            const networkListener = repositoryFactory.createListener();

            const currentPeer = URLHelpers.getNodeUrl(networkModel.url);
            commit('currentPeer', currentPeer);
            if (currentProfile) {
                const profileService: ProfileService = new ProfileService();
                profileService.updateSelectedNode(currentProfile, currentPeer);
            }
            const currentNetworkType = currentProfile ? currentProfile.networkType : networkType;
            commit('networkModel', networkModel);
            commit('networkConfiguration', networkModel.networkConfiguration);
            commit('transactionFees', networkModel.transactionFees);
            commit('networkType', networkType);
            commit('epochAdjustment', networkModel.networkConfiguration.epochAdjustment);
            commit('generationHash', networkModel.generationHash);
            commit('repositoryFactory', repositoryFactory);
            commit(
                'knowNodes',
                nodes.filter((node) => node.networkType === currentNetworkType),
            );
            const currentNetworkListener: IListener = getters['listener'];
            if (currentNetworkListener && currentNetworkListener.isOpen()) {
                currentNetworkListener.close();
            }
            commit('listener', networkListener);
            if (networkListener && !networkListener.isOpen()) {
                await networkListener.open();
                await dispatch('SUBSCRIBE');
            }

            commit('currentHeight', currentHeight);
            commit(
                'currentPeerInfo',
                nodes.find((n) => n.url === networkModel.url),
            );
            commit('setConnected', true);
            commit('connectingToNodeInfo', {
                isTryingToConnect: false,
            });
            $eventBus.$emit('newConnection', currentPeer);

            // subscribe to updates
            if (oldGenerationHash != networkModel.generationHash) {
                await dispatch('account/NETWORK_CHANGED', {}, { root: true });
                await dispatch('statistics/LOAD', {}, { root: true });

                // check if current profile network type and generation hash matches current network
                if (
                    currentProfile &&
                    (currentProfile.networkType !== networkModel.networkType ||
                        currentProfile.generationHash !== networkModel.generationHash)
                ) {
                    dispatch('SET_NETWORK_IS_NOT_MATCHING_PROFILE', true);
                } else {
                    dispatch('SET_NETWORK_IS_NOT_MATCHING_PROFILE', false);
                }
            }
            const currentSignerAddress = rootGetters['account/currentSignerAddress'];
            if (currentSignerAddress) {
                // close websocket subscription for old node
                await dispatch('UNSUBSCRIBE');
                await dispatch('account/UNSUBSCRIBE', currentSignerAddress, { root: true });
                // subscribe to the newly selected node websocket
                if (networkListener && !networkListener.isOpen()) {
                    await networkListener.open();
                }
                await dispatch('SUBSCRIBE');
                await dispatch('account/SUBSCRIBE', currentSignerAddress, { root: true });
            }
        },
        SET_NETWORK_TYPE({ commit }, networkType: NetworkType) {
            commit('networkType', networkType);
        },
        async SET_CURRENT_PEER({ dispatch }, currentPeerUrl) {
            if (!UrlValidator.validate(currentPeerUrl)) {
                console.log('Cannot change node. URL is not valid: ' + currentPeerUrl);
                return await dispatch('notification/ADD_ERROR', NotificationType.INVALID_NODE, { root: true });
            }

            // - show loading overlay
            dispatch(
                'app/SET_LOADING_OVERLAY',
                {
                    show: true,
                    message: `${app.$t('info_connecting_peer', {
                        peerUrl: currentPeerUrl,
                    })}`,
                    disableCloseButton: true,
                },
                { root: true },
            );

            dispatch('diagnostic/ADD_DEBUG', 'Store action network/SET_CURRENT_PEER dispatched with: ' + currentPeerUrl, {
                root: true,
            });

            try {
                // - disconnect from previous node

                await dispatch('CONNECT', { newCandidateUrl: currentPeerUrl });
            } catch (e) {
                console.log(e);
                await dispatch(
                    'notification/ADD_ERROR',
                    `${app.$t('error_peer_connection_went_wrong', {
                        peerUrl: currentPeerUrl,
                    })}`,
                    { root: true },
                );
                dispatch('diagnostic/ADD_ERROR', 'Error with store action network/SET_CURRENT_PEER: ' + JSON.stringify(e), {
                    root: true,
                });
            } finally {
                // - hide loading overlay
                dispatch('app/SET_LOADING_OVERLAY', { show: false }, { root: true });
            }
        },

        async REST_NETWORK_RENTAL_FEES({ rootGetters, commit }) {
            const repositoryFactory: RepositoryFactory = rootGetters['network/repositoryFactory'];
            if (!repositoryFactory) {
                return;
            }
            const getRentalFeesPromise = repositoryFactory.createNetworkRepository().getRentalFees().toPromise();
            const rentalFees = await getRentalFeesPromise;
            commit('rentalFeeEstimation', rentalFees);
        },
        SET_NETWORK_IS_NOT_MATCHING_PROFILE({ commit }, networkIsNotMatchingProfile) {
            commit('networkIsNotMatchingProfile', networkIsNotMatchingProfile);
        },
        ADD_KNOWN_PEER({ commit }, peerUrl) {
            if (!UrlValidator.validate(peerUrl)) {
                throw Error('Cannot add node. URL is not valid: ' + peerUrl);
            }
            commit('addPeer', peerUrl);
        },
        REMOVE_KNOWN_PEER({ commit }, peerUrl) {
            commit('removePeer', peerUrl);
        },

        async UPDATE_PEER({ commit, rootGetters }, peerUrl) {
            const repositoryFactory = new RepositoryFactoryHttp(peerUrl);
            const nodeService = new NodeService();
            const networkType = rootGetters['network/networkType'];

            const knownNodes = await nodeService.getNodes(repositoryFactory, peerUrl, networkType).toPromise();
            commit('knowNodes', knownNodes);
        },

        async RESET_PEERS({ dispatch, getters }) {
            const nodeService = new NodeService();
            nodeService.reset();

            const networkService = new NetworkService();
            networkService.reset(getters['generationHash']);

            dispatch('SET_CURRENT_PEER', networkService.getDefaultUrl());
        },
        async LOAD_PEER_NODES({ commit, rootGetters }) {
            const repositoryFactory: RepositoryFactory = rootGetters['network/repositoryFactory'];
            const nodeRepository = repositoryFactory.createNodeRepository();

            const peerNodes: NodeInfo[] = await nodeRepository.getNodePeers().toPromise();
            const allNodes = peerNodes.sort((a, b) => a.host.localeCompare(b.host));
            commit('peerNodes', _.uniqBy(allNodes, 'host'));
        },
        // TODO :: re-apply that behavior if red screen issue fixed
        // load nodes that eligible for delegate harvesting
        // async LOAD_HARVESTING_PEERS({ commit, getters }) {
        //     const peerNodes = getters.peerNodes;
        //     peerNodes.forEach(async (node: NodeInfo) => {
        //         await setTimeout(async () => {
        //             try {
        //                 const nodeUrl = URLHelpers.getNodeUrl(node.host);
        //                 const repositoryFactory = new RepositoryFactoryHttp(nodeUrl);
        //                 const nodeRepository = repositoryFactory.createNodeRepository();
        //                 const unlockedAccounts = await nodeRepository.getUnlockedAccount().toPromise();
        //                 const nodeInfo = await nodeRepository.getNodeInfo().toPromise();

        //                 if (unlockedAccounts) {
        //                     let validNodeInfo: NodeInfo;
        //                     let harvestingPeers: NodeInfo[];
        //                     // in case nodeInfo missing host
        //                     if (!nodeInfo.host) {
        //                         validNodeInfo = new NodeInfo(
        //                             nodeInfo.publicKey,
        //                             nodeInfo.networkGenerationHashSeed,
        //                             nodeInfo.port,
        //                             nodeInfo.networkIdentifier,
        //                             nodeInfo.version,
        //                             nodeInfo.roles,
        //                             node.host,
        //                             nodeInfo.friendlyName,
        //                             nodeInfo.nodePublicKey,
        //                         );
        //                         harvestingPeers = [validNodeInfo, ...getters.harvestingPeerNodes];
        //                     } else {
        //                         harvestingPeers = [nodeInfo, ...getters.harvestingPeerNodes];
        //                     }
        //                     // update harvesting peers
        //                     commit('harvestingPeerNodes', _.uniqBy(harvestingPeers, 'host'));
        //                 }
        //             } catch (err) {
        //                 console.error('Harvesting not enabled', err);
        //             }
        //         }, 500);
        //     });
        // },
        /**
         * Websocket API
         */
        // Subscribe to latest account transactions.
        async SUBSCRIBE({ commit, dispatch, getters }) {
            // use RESTService to open websocket channel subscriptions
            const listener = getters['listener'] as Listener;
            listener.open().then(() => {
                const subscription = listener.newBlock().subscribe((block: BlockInfo) => {
                    dispatch('SET_CURRENT_HEIGHT', block.height.compact());
                    dispatch('diagnostic/ADD_INFO', 'New block height: ' + block.height.compact(), { root: true });
                });
                // update state of listeners & subscriptions
                commit('addSubscriptions', subscription);
            });
        },

        // Unsubscribe from all open websocket connections
        async UNSUBSCRIBE({ commit, getters }) {
            const subscriptions: Subscription[] = getters.subscriptions;
            subscriptions.forEach((s) => s.unsubscribe());
            const listener: Listener = getters.listener;
            if (listener && listener.isOpen()) {
                await listener.close();
            }
            // update state
            commit('subscriptions', []);
        },

        SET_CURRENT_HEIGHT({ commit }, height) {
            commit('currentHeight', height);
        },

        LOAD_TRANSACTION_FEES({ commit, rootGetters }) {
            const repositoryFactory: RepositoryFactory = rootGetters['network/repositoryFactory'];
            const networkRepository = repositoryFactory.createNetworkRepository();
            networkRepository.getTransactionFees().subscribe((fees: TransactionFees) => {
                commit('transactionFees', fees);
            });
            commit('setFeesConfig', feesConfig);
        },
    },
};
