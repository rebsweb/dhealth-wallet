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
import { Address, MultisigAccountGraphInfo, MultisigAccountInfo, NetworkType } from 'symbol-sdk';
// internal dependencies
import { AccountModel } from '@/core/database/entities/AccountModel';
import { Signer } from '@/store/Account';

export class MultisigService {
    /**
     * Returns all available multisig info from a multisig graph
     * @static
     * @param {MultisigAccountGraphInfo} multisig graph info
     * @returns {MultisigAccountInfo[]} multisig info
     */
    public static getMultisigInfoFromMultisigGraphInfo(graphInfo: MultisigAccountGraphInfo): MultisigAccountInfo[] {
        const { multisigEntries } = graphInfo;
        return [].concat(...this.getMultisigGraphArraySorted(multisigEntries)).map((item) => item); // flatten
    }

    public static getMultisigGraphArraySorted(multisigEntries: Map<number, MultisigAccountInfo[]>): MultisigAccountInfo[][] {
        return [...multisigEntries.keys()]
            .sort((a, b) => b - a) // Get addresses from top to bottom
            .map((key) => multisigEntries.get(key) || [])
            .filter((x) => x.length > 0);
    }

    public getSigners(
        networkType: NetworkType,
        knownAccounts: AccountModel[],
        currentAccount: AccountModel,
        currentAccountMultisigInfo: MultisigAccountInfo | undefined,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        multisigAccountsInfo: MultisigAccountInfo[] | undefined,
    ): Signer[] {
        if (!currentAccount) {
            return [];
        }
        const self: Signer[] = [
            {
                address: Address.createFromRawAddress(currentAccount.address),
                label: currentAccount.name,
                multisig: currentAccountMultisigInfo && currentAccountMultisigInfo.isMultisig(),
                requiredCosignatures: (currentAccountMultisigInfo && currentAccountMultisigInfo.minApproval) || 0,
            },
        ];

        if (!currentAccountMultisigInfo) {
            return self;
        }

        // check if other child multisig accounts are already cosigners of other accounts and add their children multisig as signers if any to the main cosignatory account
        let addedSignerFromMutlisigAccounts: Signer[] = [].concat(self);
        multisigAccountsInfo.map((entry) => {
            if (
                (entry.minApproval > 0 || entry.minRemoval > 0) &&
                entry.multisigAddresses.length > 0 &&
                entry.cosignatoryAddresses.some((value) => value.equals(Address.createFromRawAddress(currentAccount.address)))
            ) {
                entry.multisigAddresses.map((address) => {
                    if (!addedSignerFromMutlisigAccounts.some((val) => val.address.equals(address))) {
                        return (addedSignerFromMutlisigAccounts = addedSignerFromMutlisigAccounts.concat([
                            {
                                address: address,
                                multisig: true,
                                label: this.getAccountLabel(address, knownAccounts),
                                requiredCosignatures: (currentAccountMultisigInfo && currentAccountMultisigInfo.minApproval) || 0,
                            },
                        ]));
                    }
                });
            }
        });

        // check for next level signers and add them to the main cosignatory as signers if any
        let addressesFromNextLevel: Signer[] = [].concat(addedSignerFromMutlisigAccounts);
        multisigAccountsInfo.map((term) => {
            if (
                !term.accountAddress.equals(Address.createFromRawAddress(currentAccount.address)) &&
                !addressesFromNextLevel.find((val) => val.address.equals(term.accountAddress))
            ) {
                return (addressesFromNextLevel = addressesFromNextLevel.concat([
                    {
                        address: term.accountAddress,
                        multisig: !!term.cosignatoryAddresses.length,
                        label: this.getAccountLabel(term.accountAddress, knownAccounts),
                        requiredCosignatures: (currentAccountMultisigInfo && term.minApproval) || 0,
                    },
                ]));
            }
        });
        return addressesFromNextLevel;
    }

    private getAccountLabel(address: Address, accounts: AccountModel[]): string {
        const account = accounts.find((wlt) => address.plain() === wlt.address);
        return (account && account.name) || address.plain();
    }

    /**
     * Checks if the given address in the given multisignature tree
     * @param multisigAccountGraph Multisig tree structure
     * @param address Address to search in the tree
     * @returns
     */
    public static isAddressInMultisigTree(multisigAccountGraph: Map<number, MultisigAccountInfo[]>, address: string): boolean {
        for (const [l, levelAccounts] of multisigAccountGraph) {
            for (const levelAccount of levelAccounts) {
                if (
                    levelAccount.accountAddress.plain() === address ||
                    levelAccount.cosignatoryAddresses?.some((c) => c.plain() === address)
                ) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * creates a structred Tree object containing Current multisig account with children
     * @param {MultisigAccountInfo[][]} multisigEnteries
     * @returns {string[]} Array of string addresses
     */
    public getMultisigChildren(multisigAccountGraphInfo: MultisigAccountInfo[][]): string[] {
        const tree = [];
        if (multisigAccountGraphInfo) {
            multisigAccountGraphInfo.forEach((level: MultisigAccountInfo[]) => {
                const levelToMap = Symbol.iterator in Object(level) ? level : [].concat(level);

                levelToMap.forEach((entry: MultisigAccountInfo) => {
                    // if current entry is not a multisig account
                    if (entry.cosignatoryAddresses.length === 0) {
                        tree.push({
                            address: entry.accountAddress.plain(),
                            children: [],
                        });
                    } else {
                        // find the entry matching with address matching cosignatory address and update his children
                        const updateRecursively = (address, object) => (obj) => {
                            if (obj.address === address) {
                                obj.children.push(object);
                            } else if (obj.children !== undefined) {
                                obj.children.forEach(updateRecursively(address, object));
                            }
                        };
                        // @ts-ignore
                        entry.cosignatoryAddresses.forEach((addressVal) => {
                            tree.forEach(
                                updateRecursively(addressVal['address'], {
                                    // @ts-ignore
                                    address: entry.accountAddress.plain(),
                                    // @ts-ignore
                                    children: [],
                                }),
                            );
                        });
                    }
                });
            });
        }
        return tree;
    }

    /**
     *  return array of multisig children addreses
     * @param {MultisigAccountInfo[][]} multisigEnteries
     * @returns {Address[]} Array of Addresses
     */
    public getMultisigChildrenAddresses(multisigAccountGraphInfo: MultisigAccountInfo[][]) {
        const addresses: Address[] = [];

        if (multisigAccountGraphInfo) {
            const mutlisigChildrenTree = this.getMultisigChildren(multisigAccountGraphInfo);
            if (mutlisigChildrenTree && mutlisigChildrenTree.length) {
                // @ts-ignore
                CommonHelpers.parseObjectProperties(mutlisigChildrenTree[0].children, (k, prop) => {
                    addresses.push(Address.createFromRawAddress(prop));
                });
            }
            return addresses;
        }
    }
}
