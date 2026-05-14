/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICopilotTokenInfo, IDefaultAccount, IDefaultAccountAuthenticationProvider, IPolicyData } from '../../../../base/common/defaultAccount.js';
import { Event } from '../../../../base/common/event.js';
import { IDefaultAccountProvider, IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';

const TURBOFILE_AUTH_PROVIDER: IDefaultAccountAuthenticationProvider = {
	id: 'turbofile.local',
	name: 'TurboFile',
	enterprise: false
};

export class NullDefaultAccountService implements IDefaultAccountService {

	declare readonly _serviceBrand: undefined;

	readonly onDidChangeDefaultAccount = Event.None;
	readonly onDidChangePolicyData = Event.None;
	readonly onDidChangeCopilotTokenInfo = Event.None;

	readonly policyData: IPolicyData | null = null;
	readonly currentDefaultAccount: IDefaultAccount | null = null;
	readonly copilotTokenInfo: ICopilotTokenInfo | null = null;

	getDefaultAccount(): Promise<IDefaultAccount | null> {
		return Promise.resolve(null);
	}

	getDefaultAccountAuthenticationProvider(): IDefaultAccountAuthenticationProvider {
		return TURBOFILE_AUTH_PROVIDER;
	}

	setDefaultAccountProvider(_provider: IDefaultAccountProvider): void {
		// TurboFile does not ship account-backed Chat or Copilot services.
	}

	refresh(): Promise<IDefaultAccount | null> {
		return Promise.resolve(null);
	}

	signIn(): Promise<IDefaultAccount | null> {
		return Promise.resolve(null);
	}

	signOut(): Promise<void> {
		return Promise.resolve();
	}
}
