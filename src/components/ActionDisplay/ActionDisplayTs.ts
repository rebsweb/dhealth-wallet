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
import { Component, Prop, Vue, Watch } from 'vue-property-decorator';
import { Address, Transaction, TransactionType } from 'symbol-sdk';
// @ts-ignore
import AddressDisplay from '@/components/AddressDisplay/AddressDisplay.vue';
import { mapGetters } from 'vuex';

@Component({
    components: {
        AddressDisplay,
    },
    computed: {
        ...mapGetters({
            address: 'account/currentAccountAddress',
        }),
    },
})
export class ActionDisplayTs extends Vue {
    /**
     * Transaction
     * @type {Transaction}
     */
    @Prop({ default: null }) transaction: Transaction;
    /**
     * Transaction type from SDK
     * @type {TransactionType}
     */
    public transactionType = TransactionType;

    /**
     * @protected
     * @type {boolean}
     */
    protected address: Address;

    /**
     * Multisig Aggregate Transaction Signer
     * @private
     * @type {Address}
     */
    @Prop({ default: undefined })
    private aggregateTransactionSenderAddress: Address;

    /**
     * Whether the transaction needs a cosignature
     * // @TODO
     * @protected
     * @type {boolean}
     */
    protected needsCosignature: boolean = false;

    /**
     * Whether the transaction has a multisig Signer
     * @protected
     * @type {boolean}
     */
    protected hasAggregateBondedSigner: boolean = false;

    /**
     * Watches aggregate transaction sender value
     */
    @Watch('aggregateTransactionSenderAddress', { immediate: true })
    onSenderAddressChange() {
        if (this.aggregateTransactionSenderAddress && this.aggregateTransactionSenderAddress.plain()) {
            this.hasAggregateBondedSigner = true;
        }
    }
}
