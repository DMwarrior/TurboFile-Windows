#include <windows.h>
#include <shlobj.h>
#include <shellapi.h>

#include <algorithm>
#include <cwchar>
#include <new>
#include <string>

// Must match TURBOFILE_WINDOWS_DRAG_COPY_HOOK_CLSID in turbofileSshMainService.ts.
static const CLSID CLSID_TurboFileCopyHook =
{ 0xd650a1fa, 0x43c6, 0x4b8f, { 0x8c, 0x83, 0x80, 0xb0, 0x28, 0x35, 0x3f, 0x64 } };

static const wchar_t kFakeDirectoryPrefix[] = L"TurboFileDrop-";
static const wchar_t kRootPath[] = L"\\TurboFile\\DragDrop";
static const wchar_t kActivePathMarker[] = L"\\TurboFile\\DragDrop\\Active\\";
static const wchar_t kTargetsPath[] = L"\\TurboFile\\DragDrop\\Targets";

HINSTANCE g_instance = nullptr;
volatile long g_moduleRefCount = 0;

static std::wstring ToBackslashPath(std::wstring value)
{
	std::replace(value.begin(), value.end(), L'/', L'\\');
	return value;
}

static std::wstring ToLowerAscii(std::wstring value)
{
	for (wchar_t& ch : value) {
		if (ch >= L'A' && ch <= L'Z') {
			ch = static_cast<wchar_t>(ch - L'A' + L'a');
		}
	}
	return value;
}

static bool StartsWith(const std::wstring& value, const std::wstring& prefix)
{
	return value.size() >= prefix.size() && value.compare(0, prefix.size(), prefix) == 0;
}

static bool IsValidToken(const std::wstring& token)
{
	if (token.size() < 6 || token.size() > 128) {
		return false;
	}
	for (wchar_t ch : token) {
		const bool valid =
			(ch >= L'a' && ch <= L'z') ||
			(ch >= L'A' && ch <= L'Z') ||
			(ch >= L'0' && ch <= L'9') ||
			ch == L'_' ||
			ch == L'-';
		if (!valid) {
			return false;
		}
	}
	return true;
}

static std::wstring TrimTrailingSlashes(std::wstring value)
{
	while (value.size() > 3 && (value.back() == L'\\' || value.back() == L'/')) {
		value.pop_back();
	}
	return value;
}

static std::wstring BaseName(const std::wstring& path)
{
	const std::wstring normalized = TrimTrailingSlashes(ToBackslashPath(path));
	const size_t slash = normalized.find_last_of(L'\\');
	return slash == std::wstring::npos ? normalized : normalized.substr(slash + 1);
}

static bool TryExtractTurboFileToken(const wchar_t* sourcePath, std::wstring& token)
{
	if (!sourcePath || !*sourcePath) {
		return false;
	}

	const std::wstring normalized = ToBackslashPath(sourcePath);
	if (ToLowerAscii(normalized).find(ToLowerAscii(kActivePathMarker)) == std::wstring::npos) {
		return false;
	}

	const std::wstring name = BaseName(normalized);
	if (!StartsWith(name, kFakeDirectoryPrefix)) {
		return false;
	}

	const std::wstring candidate = name.substr(wcslen(kFakeDirectoryPrefix));
	if (!IsValidToken(candidate)) {
		return false;
	}

	token = candidate;
	return true;
}

static bool ContainsTurboFileFakeDirectoryName(const wchar_t* path)
{
	if (!path || !*path) {
		return false;
	}
	return ToLowerAscii(ToBackslashPath(path)).find(ToLowerAscii(kFakeDirectoryPrefix)) != std::wstring::npos;
}

static std::wstring GetLocalAppDataPath()
{
	DWORD required = GetEnvironmentVariableW(L"LOCALAPPDATA", nullptr, 0);
	if (required == 0) {
		return std::wstring();
	}

	std::wstring value(required, L'\0');
	DWORD written = GetEnvironmentVariableW(L"LOCALAPPDATA", &value[0], required);
	if (written == 0 || written >= required) {
		return std::wstring();
	}
	value.resize(written);
	return value;
}

static bool EnsureDirectory(const std::wstring& path)
{
	const int result = SHCreateDirectoryExW(nullptr, path.c_str(), nullptr);
	return result == ERROR_SUCCESS || result == ERROR_ALREADY_EXISTS || result == ERROR_FILE_EXISTS;
}

static bool WriteUtf8File(const std::wstring& path, const std::wstring& content)
{
	const int charCount = static_cast<int>(content.size());
	const int byteCount = WideCharToMultiByte(CP_UTF8, 0, content.c_str(), charCount, nullptr, 0, nullptr, nullptr);
	if (byteCount <= 0) {
		return false;
	}

	std::string utf8(static_cast<size_t>(byteCount), '\0');
	WideCharToMultiByte(CP_UTF8, 0, content.c_str(), charCount, &utf8[0], byteCount, nullptr, nullptr);

	HANDLE file = CreateFileW(path.c_str(), GENERIC_WRITE, FILE_SHARE_READ, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
	if (file == INVALID_HANDLE_VALUE) {
		return false;
	}

	DWORD written = 0;
	const BOOL ok = WriteFile(file, utf8.data(), static_cast<DWORD>(utf8.size()), &written, nullptr);
	CloseHandle(file);
	return ok && written == utf8.size();
}

static void AppendDebugLog(const std::wstring& message)
{
	const std::wstring localAppData = GetLocalAppDataPath();
	if (localAppData.empty()) {
		return;
	}

	const std::wstring rootDir = localAppData + kRootPath;
	if (!EnsureDirectory(rootDir)) {
		return;
	}

	SYSTEMTIME now;
	GetLocalTime(&now);
	wchar_t timestamp[64] = {};
	swprintf_s(timestamp, L"%04u-%02u-%02u %02u:%02u:%02u.%03u ",
		now.wYear, now.wMonth, now.wDay, now.wHour, now.wMinute, now.wSecond, now.wMilliseconds);

	const std::wstring line = std::wstring(timestamp) + message + L"\r\n";
	const int byteCount = WideCharToMultiByte(CP_UTF8, 0, line.c_str(), static_cast<int>(line.size()), nullptr, 0, nullptr, nullptr);
	if (byteCount <= 0) {
		return;
	}

	std::string utf8(static_cast<size_t>(byteCount), '\0');
	WideCharToMultiByte(CP_UTF8, 0, line.c_str(), static_cast<int>(line.size()), &utf8[0], byteCount, nullptr, nullptr);

	const std::wstring logPath = rootDir + L"\\copyhook.log";
	HANDLE file = CreateFileW(logPath.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
	if (file == INVALID_HANDLE_VALUE) {
		return;
	}

	DWORD written = 0;
	WriteFile(file, utf8.data(), static_cast<DWORD>(utf8.size()), &written, nullptr);
	CloseHandle(file);
}

static bool WriteDropTarget(const std::wstring& token, const wchar_t* destinationPath)
{
	if (!destinationPath || !*destinationPath) {
		return false;
	}

	const std::wstring localAppData = GetLocalAppDataPath();
	if (localAppData.empty()) {
		return false;
	}

	const std::wstring targetDir = localAppData + kTargetsPath;
	if (!EnsureDirectory(targetDir)) {
		return false;
	}

	const std::wstring targetFile = targetDir + L"\\" + token + L".target";
	return WriteUtf8File(targetFile, destinationPath);
}

class TurboFileCopyHook final : public IShellExtInit, public ICopyHookW
{
public:
	TurboFileCopyHook() : refCount(1)
	{
		InterlockedIncrement(&g_moduleRefCount);
	}

	~TurboFileCopyHook()
	{
		InterlockedDecrement(&g_moduleRefCount);
	}

	IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) override
	{
		if (!ppv) {
			return E_POINTER;
		}

		*ppv = nullptr;
		if (IsEqualIID(riid, IID_IUnknown) || IsEqualIID(riid, IID_IShellExtInit)) {
			*ppv = static_cast<IShellExtInit*>(this);
		} else if (IsEqualIID(riid, IID_ICopyHookW) || IsEqualIID(riid, IID_IShellCopyHookW)) {
			*ppv = static_cast<ICopyHookW*>(this);
		}

		if (!*ppv) {
			return E_NOINTERFACE;
		}

		AddRef();
		return S_OK;
	}

	IFACEMETHODIMP_(ULONG) AddRef() override
	{
		return InterlockedIncrement(&refCount);
	}

	IFACEMETHODIMP_(ULONG) Release() override
	{
		const ULONG count = InterlockedDecrement(&refCount);
		if (count == 0) {
			delete this;
		}
		return count;
	}

	IFACEMETHODIMP Initialize(LPCITEMIDLIST, IDataObject*, HKEY) override
	{
		return S_OK;
	}

	IFACEMETHODIMP_(UINT) CopyCallback(HWND, UINT function, UINT, PCWSTR sourcePath, DWORD, PCWSTR destinationPath, DWORD) override
	{
		const bool shouldLog = ContainsTurboFileFakeDirectoryName(sourcePath) || ContainsTurboFileFakeDirectoryName(destinationPath);
		if (shouldLog) {
			AppendDebugLog(std::wstring(L"CopyCallback function=") + std::to_wstring(function) + L" source=" + (sourcePath ? sourcePath : L"") + L" destination=" + (destinationPath ? destinationPath : L""));
		}

		if (function != FO_COPY && function != FO_MOVE) {
			return IDYES;
		}

		std::wstring token;
		if (!TryExtractTurboFileToken(sourcePath, token)) {
			if (shouldLog) {
				AppendDebugLog(L"CopyCallback ignored: source path is not an active TurboFile fake directory.");
			}
			return IDYES;
		}

		const bool targetWritten = WriteDropTarget(token, destinationPath);
		AppendDebugLog(std::wstring(L"CopyCallback intercepted token=") + token + (targetWritten ? L" target written." : L" target write failed."));
		return IDNO;
	}

private:
	volatile long refCount;
};

class TurboFileClassFactory final : public IClassFactory
{
public:
	TurboFileClassFactory() : refCount(1)
	{
		InterlockedIncrement(&g_moduleRefCount);
	}

	~TurboFileClassFactory()
	{
		InterlockedDecrement(&g_moduleRefCount);
	}

	IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) override
	{
		if (!ppv) {
			return E_POINTER;
		}

		*ppv = nullptr;
		if (IsEqualIID(riid, IID_IUnknown) || IsEqualIID(riid, IID_IClassFactory)) {
			*ppv = static_cast<IClassFactory*>(this);
		}

		if (!*ppv) {
			return E_NOINTERFACE;
		}

		AddRef();
		return S_OK;
	}

	IFACEMETHODIMP_(ULONG) AddRef() override
	{
		return InterlockedIncrement(&refCount);
	}

	IFACEMETHODIMP_(ULONG) Release() override
	{
		const ULONG count = InterlockedDecrement(&refCount);
		if (count == 0) {
			delete this;
		}
		return count;
	}

	IFACEMETHODIMP CreateInstance(IUnknown* outer, REFIID riid, void** ppv) override
	{
		if (outer) {
			return CLASS_E_NOAGGREGATION;
		}

		TurboFileCopyHook* extension = new (std::nothrow) TurboFileCopyHook();
		if (!extension) {
			return E_OUTOFMEMORY;
		}

		const HRESULT result = extension->QueryInterface(riid, ppv);
		extension->Release();
		return result;
	}

	IFACEMETHODIMP LockServer(BOOL lock) override
	{
		if (lock) {
			InterlockedIncrement(&g_moduleRefCount);
		} else {
			InterlockedDecrement(&g_moduleRefCount);
		}
		return S_OK;
	}

private:
	volatile long refCount;
};

STDAPI DllGetClassObject(REFCLSID clsid, REFIID riid, void** ppv)
{
	if (!IsEqualCLSID(clsid, CLSID_TurboFileCopyHook)) {
		return CLASS_E_CLASSNOTAVAILABLE;
	}

	TurboFileClassFactory* factory = new (std::nothrow) TurboFileClassFactory();
	if (!factory) {
		return E_OUTOFMEMORY;
	}

	const HRESULT result = factory->QueryInterface(riid, ppv);
	factory->Release();
	return result;
}

STDAPI DllCanUnloadNow()
{
	return g_moduleRefCount == 0 ? S_OK : S_FALSE;
}

BOOL APIENTRY DllMain(HINSTANCE instance, DWORD reason, LPVOID)
{
	if (reason == DLL_PROCESS_ATTACH) {
		g_instance = instance;
		DisableThreadLibraryCalls(instance);
	}
	return TRUE;
}
