/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shobjidl.h>

class TurboFileDropSource final : public IDropSource {
public:
	TurboFileDropSource() : references(1) { }

	HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid, void **object) override {
		if (!object) {
			return E_POINTER;
		}
		if (iid == IID_IUnknown || iid == IID_IDropSource) {
			*object = static_cast<IDropSource *>(this);
			AddRef();
			return S_OK;
		}
		*object = nullptr;
		return E_NOINTERFACE;
	}

	ULONG STDMETHODCALLTYPE AddRef() override {
		return InterlockedIncrement(&references);
	}

	ULONG STDMETHODCALLTYPE Release() override {
		const ULONG remaining = InterlockedDecrement(&references);
		if (!remaining) {
			delete this;
		}
		return remaining;
	}

	HRESULT STDMETHODCALLTYPE QueryContinueDrag(BOOL escapePressed, DWORD keyState) override {
		if (escapePressed) {
			return DRAGDROP_S_CANCEL;
		}
		if ((keyState & MK_LBUTTON) == 0) {
			return DRAGDROP_S_DROP;
		}
		return S_OK;
	}

	HRESULT STDMETHODCALLTYPE GiveFeedback(DWORD) override {
		return DRAGDROP_S_USEDEFAULTCURSORS;
	}

private:
	~TurboFileDropSource() = default;
	LONG references;
};

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int) {
	int argumentCount = 0;
	LPWSTR *arguments = CommandLineToArgvW(GetCommandLineW(), &argumentCount);
	if (!arguments || argumentCount != 2) {
		if (arguments) {
			LocalFree(arguments);
		}
		return 1;
	}

	const HRESULT oleResult = OleInitialize(nullptr);
	if (FAILED(oleResult)) {
		LocalFree(arguments);
		return 1;
	}

	PIDLIST_ABSOLUTE itemIdList = ILCreateFromPathW(arguments[1]);
	LocalFree(arguments);
	if (!itemIdList) {
		OleUninitialize();
		return 1;
	}

	IShellFolder *parentFolder = nullptr;
	PCUITEMID_CHILD childId = nullptr;
	IDataObject *dataObject = nullptr;
	HRESULT result = SHBindToParent(itemIdList, IID_PPV_ARGS(&parentFolder), &childId);
	if (SUCCEEDED(result)) {
		result = parentFolder->GetUIObjectOf(nullptr, 1, &childId, IID_IDataObject, nullptr, reinterpret_cast<void **>(&dataObject));
	}

	DWORD effect = DROPEFFECT_NONE;
	if (SUCCEEDED(result) && dataObject) {
		TurboFileDropSource *dropSource = new TurboFileDropSource();
		result = DoDragDrop(dataObject, dropSource, DROPEFFECT_COPY, &effect);
		dropSource->Release();
	}

	if (dataObject) {
		dataObject->Release();
	}
	if (parentFolder) {
		parentFolder->Release();
	}
	CoTaskMemFree(itemIdList);
	OleUninitialize();

	if (result == DRAGDROP_S_CANCEL) {
		return 2;
	}
	return SUCCEEDED(result) && effect != DROPEFFECT_NONE ? 0 : 1;
}
