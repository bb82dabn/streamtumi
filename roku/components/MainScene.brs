sub init()
  m.apiOrigin = ApiOrigin()
  m.browseGroup = m.top.findNode("browseGroup")
  m.filterBar = m.top.findNode("filterBar")
  m.roomButton = m.top.findNode("roomButton")
  m.genreButton = m.top.findNode("genreButton")
  m.sortButton = m.top.findNode("sortButton")
  m.statusButton = m.top.findNode("statusButton")
  m.chatButton = m.top.findNode("chatButton")
  m.explicitButton = m.top.findNode("explicitButton")
  m.filterButtons = [m.roomButton, m.genreButton, m.sortButton, m.statusButton, m.chatButton, m.explicitButton]
  m.filterIndex = 0
  m.catalogState = m.top.findNode("catalogState")
  m.rows = m.top.findNode("stationRows")
  m.heroArtwork = m.top.findNode("heroArtwork")
  m.heroEyebrow = m.top.findNode("heroEyebrow")
  m.heroTitle = m.top.findNode("heroTitle")
  m.heroDescription = m.top.findNode("heroDescription")
  m.heroMeta = m.top.findNode("heroMeta")
  m.video = m.top.findNode("video")
  m.video.disableScreenSaver = false
  m.audio = m.top.findNode("audio")
  m.radioVisual = m.top.findNode("radioVisual")
  m.radioArtwork = m.top.findNode("radioArtwork")
  m.radioKind = m.top.findNode("radioKind")
  m.radioTrackTitle = m.top.findNode("radioTrackTitle")
  m.radioArtist = m.top.findNode("radioArtist")
  m.radioContext = m.top.findNode("radioContext")
  m.playerSlate = m.top.findNode("playerSlate")
  m.playerShade = m.top.findNode("playerShade")
  m.playerInfo = m.top.findNode("playerInfo")
  m.playerStatus = m.top.findNode("playerStatus")
  m.playerTitle = m.top.findNode("playerTitle")
  m.programTitle = m.top.findNode("programTitle")
  m.playerHint = m.top.findNode("playerHint")
  m.playerKeyCatcher = m.top.findNode("playerKeyCatcher")
  m.modalKeyCatcher = m.top.findNode("modalKeyCatcher")
  m.chatPanel = m.top.findNode("chatPanel")
  m.chatList = m.top.findNode("chatList")
  m.chatState = m.top.findNode("chatState")
  m.transitionOverlay = m.top.findNode("transitionOverlay")
  m.transitionTitle = m.top.findNode("transitionTitle")
  m.weatherStandby = m.top.findNode("weatherStandby")
  m.weatherStandbyStatus = m.top.findNode("weatherStandbyStatus")
  m.loadingOverlay = m.top.findNode("loadingOverlay")
  m.loadingText = m.top.findNode("loadingText")
  m.errorOverlay = m.top.findNode("errorOverlay")
  m.errorMessage = m.top.findNode("errorMessage")
  m.retryButton = m.top.findNode("retryButton")
  m.accountOverlay = m.top.findNode("accountOverlay")
  m.accountMenuGroup = m.top.findNode("accountMenuGroup")
  m.accountLoginGroup = m.top.findNode("accountLoginGroup")
  m.accountSummary = m.top.findNode("accountSummary")
  m.accountPairButton = m.top.findNode("accountPairButton")
  m.accountLoginButton = m.top.findNode("accountLoginButton")
  m.accountUnlinkButton = m.top.findNode("accountUnlinkButton")
  m.accountCloseButton = m.top.findNode("accountCloseButton")
  m.loginPrompt = m.top.findNode("loginPrompt")
  m.loginKeyboard = m.top.findNode("loginKeyboard")
  m.loginStatus = m.top.findNode("loginStatus")
  m.loginHint = m.top.findNode("loginHint")
  m.activationOverlay = m.top.findNode("activationOverlay")
  m.activationTitle = m.top.findNode("activationTitle")
  m.activationStatus = m.top.findNode("activationStatus")
  m.activationCodeLabel = m.top.findNode("activationCode")
  m.activationUrl = m.top.findNode("activationUrl")
  m.activationHint = m.top.findNode("activationHint")
  m.roomOverlay = m.top.findNode("roomOverlay")
  m.roomCodeLabel = m.top.findNode("roomCode")
  m.roomStatus = m.top.findNode("roomStatus")
  m.roomFocusRing = m.top.findNode("roomFocusRing")
  m.roomPadButtons = [
    m.top.findNode("roomDigit1"), m.top.findNode("roomDigit2"), m.top.findNode("roomDigit3"),
    m.top.findNode("roomDigit4"), m.top.findNode("roomDigit5"), m.top.findNode("roomDigit6"),
    m.top.findNode("roomDigit7"), m.top.findNode("roomDigit8"), m.top.findNode("roomDigit9"),
    m.top.findNode("roomDelete"), m.top.findNode("roomDigit0"), m.top.findNode("roomJoin")
  ]
  m.catalogTask = m.top.findNode("catalogTask")
  m.stationTask = m.top.findNode("stationTask")
  m.chatTask = m.top.findNode("chatTask")
  m.deviceTask = m.top.findNode("deviceTask")
  m.tuneTask = m.top.findNode("tuneTask")
  m.weatherTask = m.top.findNode("weatherTask")
  m.roomAccessTask = m.top.findNode("roomAccessTask")
  m.privateRoomTask = m.top.findNode("privateRoomTask")
  m.roomSessionTask = m.top.findNode("roomSessionTask")
  m.savedRoomTask = m.top.findNode("savedRoomTask")
  m.chatTimer = m.top.findNode("chatTimer")
  m.syncTimer = m.top.findNode("syncTimer")
  m.transitionTimer = m.top.findNode("transitionTimer")
  m.playerInfoTimer = m.top.findNode("playerInfoTimer")
  m.catalogTimer = m.top.findNode("catalogTimer")
  m.radioVisualTimer = m.top.findNode("radioVisualTimer")
  m.devicePollTimer = m.top.findNode("devicePollTimer")
  m.tuneTimer = m.top.findNode("tuneTimer")
  m.weatherRetryTimer = m.top.findNode("weatherRetryTimer")
  m.mediaRetryTimer = m.top.findNode("mediaRetryTimer")
  m.modalFocusTimer = m.top.findNode("modalFocusTimer")

  m.stations = []
  m.privateRooms = []
  m.guestRooms = []
  m.savedRoomTokens = ReadRoomSessionTokens()
  m.savedRoomsLoaded = false
  m.savedRoomResolveIndex = 0
  m.savedRoomTokensToKeep = []
  m.genres = []
  m.genreIndex = 0
  m.sortIndex = 0
  m.sortKeys = ["viewers", "rating", "fans", "chat", "newest", "name", "genre"]
  m.sortNames = ["Popular", "Top rated", "Most fans", "Chat active", "Newest", "Name", "Genre"]
  m.onAirOnly = false
  m.includeExplicit = SettingEnabled("includeExplicit", false)
  m.chatDefault = SettingEnabled("showChat", false)
  m.isPlaying = false
  m.chatVisible = false
  m.currentStation = invalid
  m.stationData = invalid
  m.currentIndex = 0
  m.currentVideoId = ""
  m.currentChannelVersion = ""
  m.currentRadioSessionId = ""
  m.radioUsesVisual = false
  m.radioVisualFailedSessionId = ""
  m.radioVisualStarting = false
  m.refreshingStation = false
  m.tuningStation = false
  m.stationRequestId = 0
  m.stationDesiredRequestId = 0
  m.stationActiveRequestId = 0
  m.stationActiveUrl = ""
  m.stationActiveToken = ""
  m.stationQueuedRequestId = 0
  m.stationQueuedUrl = ""
  m.stationQueuedToken = ""
  m.surfDirection = 1
  m.surfAttempts = 0
  m.enteredBySurf = false
  m.catalogLoading = false
  m.catalogSilent = false
  m.catalogRequestId = 0
  m.catalogDesiredRequestId = 0
  m.catalogActiveRequestId = 0
  m.catalogActiveUrl = ""
  m.catalogActiveToken = ""
  m.catalogActiveAuthGeneration = 0
  m.catalogActiveIncludeExplicit = false
  m.catalogActiveSilent = false
  m.catalogQueuedRequestId = 0
  m.catalogQueuedUrl = ""
  m.catalogQueuedToken = ""
  m.catalogQueuedAuthGeneration = 0
  m.catalogQueuedIncludeExplicit = false
  m.catalogQueuedSilent = false
  m.deviceToken = ReadDeviceToken()
  m.authGeneration = 0
  m.account = invalid
  m.deviceCode = ""
  m.deviceAction = ""
  m.deviceGeneration = 0
  m.deviceRequestId = 0
  m.deviceDesiredRequestId = 0
  m.deviceActiveRequestId = 0
  m.deviceActiveAction = ""
  m.deviceActiveAuthGeneration = 0
  m.deviceActiveGeneration = 0
  m.deviceActiveToken = ""
  m.deviceQueuedRequestId = 0
  m.deviceQueuedAction = ""
  m.deviceQueuedUrl = ""
  m.deviceQueuedBody = ""
  m.deviceQueuedToken = ""
  m.deviceQueuedAuthGeneration = 0
  m.deviceQueuedGeneration = 0
  m.devicePollRetryCount = 0
  m.loginStep = ""
  m.loginEmail = ""
  m.loginPending = false
  m.accountMenuIndex = 0
  m.roomAccessKey = ""
  m.roomPadIndex = 0
  m.roomAccessRetried = false
  m.roomAccessAwaiting = false
  m.roomAccessCancelled = false
  m.roomAccessRequestId = 0
  m.roomAccessDesiredRequestId = 0
  m.roomAccessActiveRequestId = 0
  m.roomAccessActiveBody = ""
  m.roomAccessActiveToken = ""
  m.roomAccessActiveAuthGeneration = 0
  m.roomAccessQueuedRequestId = 0
  m.roomAccessQueuedBody = ""
  m.roomAccessQueuedToken = ""
  m.roomAccessQueuedAuthGeneration = 0
  m.pendingExplicitRoom = invalid
  m.privateRoomAction = ""
  m.roomSessionAction = ""
  m.privateRoomRequestId = 0
  m.privateRoomDesiredRequestId = 0
  m.privateRoomActiveRequestId = 0
  m.privateRoomActiveAction = ""
  m.privateRoomActiveUrl = ""
  m.privateRoomActiveToken = ""
  m.privateRoomActiveAuthGeneration = 0
  m.privateRoomActivePlaybackGeneration = 0
  m.privateRoomQueuedRequestId = 0
  m.privateRoomQueuedAction = ""
  m.privateRoomQueuedUrl = ""
  m.privateRoomQueuedToken = ""
  m.privateRoomQueuedAuthGeneration = 0
  m.privateRoomQueuedPlaybackGeneration = 0
  m.roomSessionRequestId = 0
  m.roomSessionDesiredRequestId = 0
  m.roomSessionActiveRequestId = 0
  m.roomSessionActiveAction = ""
  m.roomSessionActiveToken = ""
  m.roomSessionActivePlaybackGeneration = 0
  m.roomSessionQueuedRequestId = 0
  m.roomSessionQueuedAction = ""
  m.roomSessionQueuedToken = ""
  m.roomSessionQueuedPlaybackGeneration = 0
  m.savedRoomRequestId = 0
  m.savedRoomActiveRequestId = 0
  m.savedRoomActiveToken = ""
  m.savedRoomAdvancePending = false
  m.currentRoomType = ""
  m.currentRoomSessionToken = ""
  m.currentRoomAccessUrl = ""
  m.roomGrantExpiresAt = 0
  m.roomRenewing = false
  m.roomRestartAfterRefresh = false
  m.tuneSessionId = ""
  m.tuneStationToken = ""
  m.tuneSubmitted = false
  m.tuneTimerStarted = false
  m.tuneRequestId = 0
  m.tuneActiveRequestId = 0
  m.tuneActiveAuthGeneration = 0
  m.weatherTuning = false
  m.weatherRenewing = false
  m.weatherPlayback = invalid
  m.weatherExpiresAt = 0
  m.weatherTuneId = ""
  m.weatherStationToken = ""
  m.weatherRequestId = 0
  m.weatherDesiredRequestId = 0
  m.weatherActiveRequestId = 0
  m.weatherActiveTuneId = ""
  m.weatherActiveStationToken = ""
  m.weatherActiveAction = ""
  m.weatherQueuedRequestId = 0
  m.weatherQueuedTuneId = ""
  m.weatherQueuedStationToken = ""
  m.weatherQueuedAction = ""
  m.weatherRetryCount = 0
  m.weatherProvisionRetryCount = 0
  m.weatherRetryMode = ""
  m.weatherRetryTuneId = ""
  m.weatherRetryStationToken = ""
  m.weatherRetryAction = ""
  m.weatherFailedTuneId = ""
  m.weatherFailedStationToken = ""
  m.weatherFailedAction = ""
  m.weatherStartedPlaying = false
  m.weatherActiveAuthGeneration = 0
  m.weatherActiveDeviceToken = ""
  m.weatherQueuedAuthGeneration = 0
  m.weatherQueuedDeviceToken = ""
  m.weatherRetryAuthGeneration = 0
  m.weatherRetryDeviceToken = ""
  m.weatherRetryPlaybackGeneration = -1
  m.playbackGeneration = 0
  m.videoPlaybackGeneration = -1
  m.videoStationToken = ""
  m.audioPlaybackGeneration = -1
  m.audioStationToken = ""
  m.transitionPlaybackGeneration = -1
  m.transitionStationToken = ""
  m.radioFallbackPlaybackGeneration = -1
  m.radioFallbackStationToken = ""
  m.chatRequestId = 0
  m.chatDesiredRequestId = 0
  m.chatActiveRequestId = 0
  m.chatActiveUrl = ""
  m.chatActiveStationToken = ""
  m.chatActivePlaybackGeneration = -1
  m.chatQueuedRequestId = 0
  m.chatQueuedUrl = ""
  m.chatQueuedStationToken = ""
  m.chatQueuedPlaybackGeneration = -1
  m.mediaRetryCount = 0
  m.mediaRetryMode = ""
  m.mediaRetryPlaybackGeneration = -1
  m.mediaRetryStationToken = ""
  m.mediaFailedMode = ""

  m.catalogTask.observeField("result", "onCatalogLoaded")
  m.catalogTask.observeField("state", "onCatalogTaskStateChanged")
  m.stationTask.observeField("result", "onStationLoaded")
  m.stationTask.observeField("state", "onStationTaskStateChanged")
  m.chatTask.observeField("result", "onChatLoaded")
  m.chatTask.observeField("state", "onChatTaskStateChanged")
  m.deviceTask.observeField("result", "onDeviceTaskCompleted")
  m.deviceTask.observeField("state", "onDeviceTaskStateChanged")
  m.tuneTask.observeField("result", "onTuneSubmitted")
  m.weatherTask.observeField("result", "onWeatherProvisioned")
  m.weatherTask.observeField("state", "onWeatherTaskStateChanged")
  m.roomAccessTask.observeField("result", "onRoomAccessCompleted")
  m.roomAccessTask.observeField("state", "onRoomAccessTaskStateChanged")
  m.privateRoomTask.observeField("result", "onPrivateRoomCompleted")
  m.privateRoomTask.observeField("state", "onPrivateRoomTaskStateChanged")
  m.roomSessionTask.observeField("result", "onRoomSessionCompleted")
  m.roomSessionTask.observeField("state", "onRoomSessionTaskStateChanged")
  m.savedRoomTask.observeField("result", "onSavedRoomCompleted")
  m.savedRoomTask.observeField("state", "onSavedRoomTaskStateChanged")
  m.rows.observeField("rowItemFocused", "onStationFocused")
  m.rows.observeField("selectPressed", "onStationSelected")
  m.roomButton.observeField("buttonSelected", "showRoomEntry")
  m.genreButton.observeField("buttonSelected", "onGenreSelected")
  m.sortButton.observeField("buttonSelected", "onSortSelected")
  m.statusButton.observeField("buttonSelected", "onStatusSelected")
  m.chatButton.observeField("buttonSelected", "onChatSettingSelected")
  m.explicitButton.observeField("buttonSelected", "onExplicitSelected")
  m.accountPairButton.observeField("buttonSelected", "onAccountPairSelected")
  m.accountLoginButton.observeField("buttonSelected", "showAccountLogin")
  m.accountUnlinkButton.observeField("buttonSelected", "onAccountUnlinkSelected")
  m.accountCloseButton.observeField("buttonSelected", "closeAccountMenu")
  for each button in m.roomPadButtons
    button.observeField("buttonSelected", "onRoomPadSelected")
  end for
  m.video.observeField("state", "onVideoStateChanged")
  m.video.observeField("keyPressed", "onVideoKeyPressed")
  m.audio.observeField("state", "onAudioStateChanged")
  m.playerKeyCatcher.observeField("keyPressed", "onPlayerKeyPressed")
  m.modalKeyCatcher.observeField("keyPressed", "onModalKeyPressed")
  m.chatTimer.observeField("fire", "onChatTimer")
  m.syncTimer.observeField("fire", "onSyncTimer")
  m.transitionTimer.observeField("fire", "onTransitionTimer")
  m.playerInfoTimer.observeField("fire", "hidePlayerInfo")
  m.catalogTimer.observeField("fire", "onCatalogTimer")
  m.radioVisualTimer.observeField("fire", "onRadioVisualTimeout")
  m.devicePollTimer.observeField("fire", "onDevicePollTimer")
  m.tuneTimer.observeField("fire", "onTuneTimer")
  m.weatherRetryTimer.observeField("fire", "onWeatherRetryTimer")
  m.mediaRetryTimer.observeField("fire", "onMediaRetryTimer")
  m.modalFocusTimer.observeField("fire", "onModalFocusTimer")
  m.retryButton.observeField("buttonSelected", "onRetry")

  updateFilterLabels()
  loadCatalog()
end sub

sub loadCatalog(silent = false as boolean)
  m.catalogLoading = true
  m.catalogSilent = silent
  if silent
    m.catalogState.text = "Updating stations…"
  else
    m.loadingText.text = "Loading StreamTumi stations…"
    m.loadingOverlay.visible = true
    m.errorOverlay.visible = false
  end if
  url = m.apiOrigin + "/api/roku/v2/catalog"
  if m.deviceToken <> "" then url = m.apiOrigin + "/api/device/v1/catalog"
  if m.includeExplicit then url = url + "?includeExplicit=true&adultAttested=true"
  m.catalogRequestId = m.catalogRequestId + 1
  m.catalogDesiredRequestId = m.catalogRequestId
  m.catalogQueuedRequestId = m.catalogDesiredRequestId
  m.catalogQueuedUrl = url
  m.catalogQueuedToken = m.deviceToken
  m.catalogQueuedAuthGeneration = m.authGeneration
  m.catalogQueuedIncludeExplicit = m.includeExplicit
  m.catalogQueuedSilent = silent
  startQueuedCatalogRequest()
end sub

sub startQueuedCatalogRequest()
  if m.catalogActiveRequestId <> 0 or m.catalogQueuedRequestId = 0 then return
  if LCase(m.catalogTask.state) = "run" then return
  m.catalogActiveRequestId = m.catalogQueuedRequestId
  m.catalogActiveUrl = m.catalogQueuedUrl
  m.catalogActiveToken = m.catalogQueuedToken
  m.catalogActiveAuthGeneration = m.catalogQueuedAuthGeneration
  m.catalogActiveIncludeExplicit = m.catalogQueuedIncludeExplicit
  m.catalogActiveSilent = m.catalogQueuedSilent
  m.catalogQueuedRequestId = 0
  m.catalogQueuedUrl = ""
  m.catalogQueuedToken = ""
  m.catalogTask.url = m.catalogActiveUrl
  m.catalogTask.method = "GET"
  m.catalogTask.body = ""
  m.catalogTask.deviceToken = m.catalogActiveToken
  m.catalogTask.requestId = m.catalogActiveRequestId
  m.catalogTask.control = "run"
end sub

function catalogRequestMatchesCurrent(requestUrl as string, authGeneration as integer, deviceToken as string, includeExplicit as boolean) as boolean
  if authGeneration <> m.authGeneration or deviceToken <> m.deviceToken then return false
  if includeExplicit <> m.includeExplicit then return false
  expectedUrl = m.apiOrigin + "/api/roku/v2/catalog"
  if m.deviceToken <> "" then expectedUrl = m.apiOrigin + "/api/device/v1/catalog"
  if m.includeExplicit then expectedUrl = expectedUrl + "?includeExplicit=true&adultAttested=true"
  return requestUrl = expectedUrl
end function

sub onCatalogLoaded()
  response = m.catalogTask.result
  if response = invalid then return
  if response.requestId = invalid or response.requestId <> m.catalogActiveRequestId then return
  requestUrl = m.catalogActiveUrl
  requestToken = m.catalogActiveToken
  authGeneration = m.catalogActiveAuthGeneration
  includeExplicit = m.catalogActiveIncludeExplicit
  silent = m.catalogActiveSilent
  m.catalogActiveRequestId = 0
  m.catalogActiveUrl = ""
  m.catalogActiveToken = ""
  if response.requestId <> m.catalogDesiredRequestId then return
  if not catalogRequestMatchesCurrent(requestUrl, authGeneration, requestToken, includeExplicit) then return
  if not response.ok
    if requestToken <> "" and (response.status = 401 or response.status = 403)
      if clearDeviceToken(authGeneration) then loadCatalog(silent)
      return
    end if
    m.catalogLoading = false
    if silent
      m.catalogState.text = "Refresh unavailable · retrying"
      return
    end if
    showError(response.error)
    return
  end if
  focusedStation = stationAtFocus()
  focusedId = ""
  if focusedStation <> invalid then focusedId = focusedStation.id
  m.stations = response.data.stations
  m.genres = response.data.genres
  m.privateRooms = []
  if response.data.privateRooms <> invalid then m.privateRooms = response.data.privateRooms
  m.account = invalid
  if response.data.account <> invalid then m.account = response.data.account
  if m.genreIndex > m.genres.Count() then m.genreIndex = 0
  buildRows(focusedId)
  updateFilterLabels()
  m.loadingOverlay.visible = false
  m.catalogLoading = false
  stationWord = "stations"
  if m.stations.Count() = 1 then stationWord = "station"
  roomCount = m.privateRooms.Count() + m.guestRooms.Count()
  roomText = ""
  if roomCount > 0
    roomWord = "rooms"
    if roomCount = 1 then roomWord = "room"
    roomText = " · " + roomCount.ToStr() + " private " + roomWord
  end if
  m.catalogState.text = m.stations.Count().ToStr() + " public " + stationWord + roomText + " · updated now"
  m.catalogTimer.control = "start"
  if m.rows.content = invalid or m.rows.content.GetChildCount() = 0
    m.heroEyebrow.text = "NO PUBLIC STATIONS"
    m.heroTitle.text = "Nothing is broadcasting yet"
    m.heroDescription.text = "Check back later or enter a six-digit private room key."
    m.heroMeta.text = ""
  else
    if not silent then m.rows.setFocus(true)
    updateHero(stationAtFocus())
  end if
  if m.rows.content = invalid or m.rows.content.GetChildCount() = 0 then focusFilter(0)
  m.catalogSilent = false
  startSavedRoomResolution()
end sub

sub onCatalogTaskStateChanged()
  state = LCase(m.catalogTask.state)
  if state = "done" or state = "stop" then startQueuedCatalogRequest()
end sub

sub buildRows(focusedId = "" as string)
  root = CreateObject("roSGNode", "ContentNode")
  candidates = filteredStations()
  selectedGenre = selectedGenreId()

  addRoomRow(root, "Your private rooms", m.privateRooms, "device")
  addRoomRow(root, "Saved guest rooms", m.guestRooms, "session")

  if selectedGenre <> ""
    addStationRow(root, selectedGenreName(), sortedStations(candidates, currentSortKey()))
  else
    addStationRow(root, "All stations · " + currentSortName(), sortedStations(candidates, currentSortKey()))
    liveStations = []
    for each station in candidates
      if station.online then liveStations.Push(station)
    end for
    if liveStations.Count() > 0 then addStationRow(root, "Live now", sortedStations(liveStations, "viewers"))

    for each genre in m.genres
      genreStations = []
      for each station in candidates
        if station.genreId = genre.id then genreStations.Push(station)
      end for
      if genreStations.Count() > 0 then addStationRow(root, genre.name, sortedStations(genreStations, currentSortKey()))
    end for
  end if

  m.rows.content = root
  target = [0, 0]
  if focusedId <> ""
    for rowIndex = 0 to root.GetChildCount() - 1
      row = root.GetChild(rowIndex)
      for itemIndex = 0 to row.GetChildCount() - 1
        if row.GetChild(itemIndex).id = focusedId
          target = [rowIndex, itemIndex]
          exit for
        end if
      end for
    end for
  end if
  if root.GetChildCount() > 0 then m.rows.rowItemFocused = target
end sub

sub addRoomRow(root as object, title as string, values as object, roomKind as string)
  if values = invalid or values.Count() = 0 then return
  row = root.CreateChild("ContentNode")
  row.title = title
  for each station in values
    station.rokuRoomKind = roomKind
    if roomKind = "device" then station.rokuRoomAccessUrl = station.accessUrl
    item = row.CreateChild("ContentNode")
    item.id = station.id
    item.title = station.name
    kindLabel = "TV"
    if station.stationKind = "RADIO" then kindLabel = "Radio"
    item.shortDescriptionLine1 = kindLabel + " · " + station.genreName + " · by " + station.ownerName
    if station.online
      item.shortDescriptionLine2 = "ON AIR"
    else
      item.shortDescriptionLine2 = "OFF AIR"
    end if
    if station.artworkUrl <> invalid
      item.HDPosterUrl = station.artworkUrl
      item.FHDPosterUrl = station.artworkUrl
    end if
    item.AddField("stationData", "assocarray", false)
    item.stationData = station
  end for
end sub

function filteredStations() as object
  values = []
  genreId = selectedGenreId()
  for each station in m.stations
    if (genreId = "" or station.genreId = genreId) and (not m.onAirOnly or station.online)
      values.Push(station)
    end if
  end for
  return values
end function

sub addStationRow(root as object, title as string, values as object)
  if values.Count() = 0 then return
  row = root.CreateChild("ContentNode")
  row.title = title
  for each station in values
    item = row.CreateChild("ContentNode")
    item.id = station.id
    item.title = station.name
    kindLabel = "TV"
    if station.stationKind = "RADIO" then kindLabel = "Radio"
    item.shortDescriptionLine1 = kindLabel + " · " + station.genreName + " · " + station.viewerCount.ToStr() + " viewers"
    if station.online
      item.shortDescriptionLine2 = "ON AIR"
    else
      item.shortDescriptionLine2 = "OFF AIR"
    end if
    if station.artworkUrl <> invalid
      item.HDPosterUrl = station.artworkUrl
      item.FHDPosterUrl = station.artworkUrl
    end if
    item.AddField("stationData", "assocarray", false)
    item.stationData = station
  end for
end sub

function sortedStations(values as object, key as string) as object
  result = []
  for each value in values
    result.Push(value)
  end for
  if result.Count() < 2 then return result
  for left = 0 to result.Count() - 2
    for right = left + 1 to result.Count() - 1
      if stationComesBefore(result[right], result[left], key)
        swap = result[left]
        result[left] = result[right]
        result[right] = swap
      end if
    end for
  end for
  return result
end function

function stationComesBefore(a as object, b as object, key as string) as boolean
  if key = "rating"
    if a.ratingAverage <> b.ratingAverage then return a.ratingAverage > b.ratingAverage
    if a.ratingCount <> b.ratingCount then return a.ratingCount > b.ratingCount
  else if key = "fans"
    if a.fanCount <> b.fanCount then return a.fanCount > b.fanCount
  else if key = "chat"
    aChat = ""
    bChat = ""
    if a.lastChatAt <> invalid then aChat = a.lastChatAt
    if b.lastChatAt <> invalid then bChat = b.lastChatAt
    if aChat <> bChat then return aChat > bChat
  else if key = "newest"
    if a.createdAt <> b.createdAt then return a.createdAt > b.createdAt
  else if key = "name"
    if LCase(a.name) <> LCase(b.name) then return LCase(a.name) < LCase(b.name)
  else if key = "genre"
    if LCase(a.genreName) <> LCase(b.genreName) then return LCase(a.genreName) < LCase(b.genreName)
  else
    if a.online <> b.online then return a.online
    if a.viewerCount <> b.viewerCount then return a.viewerCount > b.viewerCount
    if a.fanCount <> b.fanCount then return a.fanCount > b.fanCount
  end if
  return LCase(a.name) < LCase(b.name)
end function

function selectedGenreId() as string
  if m.genreIndex = 0 or m.genreIndex > m.genres.Count() then return ""
  return m.genres[m.genreIndex - 1].id
end function

function selectedGenreName() as string
  if m.genreIndex = 0 or m.genreIndex > m.genres.Count() then return "All"
  return m.genres[m.genreIndex - 1].name
end function

function currentSortKey() as string
  return m.sortKeys[m.sortIndex]
end function

function currentSortName() as string
  return m.sortNames[m.sortIndex]
end function

sub updateFilterLabels()
  m.genreButton.text = "Genre  " + selectedGenreName()
  m.sortButton.text = "Sort  " + currentSortName()
  if m.onAirOnly
    m.statusButton.text = "On air  Only"
  else
    m.statusButton.text = "On air  All"
  end if
  if m.chatDefault
    m.chatButton.text = "Chat  On"
  else
    m.chatButton.text = "Chat  Off"
  end if
  if m.includeExplicit
    m.explicitButton.text = "18+  On"
  else
    m.explicitButton.text = "18+  Off"
  end if
end sub

sub applyFilter(index as integer)
  if index = 0
    m.genreIndex = (m.genreIndex + 1) mod (m.genres.Count() + 1)
    buildRows()
  else if index = 1
    m.sortIndex = (m.sortIndex + 1) mod m.sortKeys.Count()
    buildRows()
  else if index = 2
    m.onAirOnly = not m.onAirOnly
    buildRows()
  else if index = 3
    m.chatDefault = not m.chatDefault
    SaveSetting("showChat", m.chatDefault)
  else if index = 4
    m.includeExplicit = not m.includeExplicit
    SaveSetting("includeExplicit", m.includeExplicit)
    m.genreIndex = 0
    loadCatalog(false)
  end if
  updateFilterLabels()
end sub

sub onGenreSelected()
  applyFilter(0)
end sub

sub onSortSelected()
  applyFilter(1)
end sub

sub onStatusSelected()
  applyFilter(2)
end sub

sub onChatSettingSelected()
  applyFilter(3)
end sub

sub onExplicitSelected()
  applyFilter(4)
end sub

sub showAccountMenu()
  m.accountOverlay.visible = true
  m.accountMenuGroup.visible = true
  m.accountLoginGroup.visible = false
  m.loginKeyboard.text = ""
  m.loginEmail = ""
  m.loginStep = ""
  updateAccountMenu()
  scheduleModalFocus()
end sub

sub scheduleModalFocus()
  m.modalFocusTimer.control = "stop"
  m.modalFocusTimer.control = "start"
end sub

sub onModalFocusTimer()
  if m.roomOverlay.visible
    updateRoomPadFocus()
    m.modalKeyCatcher.setFocus(true)
  else if m.activationOverlay.visible
    m.modalKeyCatcher.setFocus(true)
  else if m.accountOverlay.visible
    if m.accountLoginGroup.visible
      m.loginKeyboard.setFocus(true)
    else
      focusAccountMenu(m.accountMenuIndex)
    end if
  end if
end sub

sub onModalKeyPressed()
  if m.roomOverlay.visible or m.activationOverlay.visible then onKeyEvent(m.modalKeyCatcher.keyPressed, true)
end sub

sub updateAccountMenu()
  linked = m.deviceToken <> ""
  m.accountPairButton.visible = not linked
  m.accountLoginButton.visible = not linked
  m.accountUnlinkButton.visible = linked
  if linked
    if m.account <> invalid
      m.accountSummary.text = m.account.displayName + Chr(10) + m.account.email
    else
      m.accountSummary.text = "This Roku is linked to a StreamTumi account."
    end if
    focusAccountMenu(0)
  else
    m.accountSummary.text = "Pair with another device, or sign in directly on this Roku."
    focusAccountMenu(0)
  end if
end sub

function accountMenuButtons() as object
  if m.deviceToken <> "" then return [m.accountUnlinkButton, m.accountCloseButton]
  return [m.accountPairButton, m.accountLoginButton, m.accountCloseButton]
end function

sub focusAccountMenu(index as integer)
  buttons = accountMenuButtons()
  if index < 0 then index = buttons.Count() - 1
  if index >= buttons.Count() then index = 0
  m.accountMenuIndex = index
  buttons[index].setFocus(true)
end sub

sub closeAccountMenu()
  m.modalFocusTimer.control = "stop"
  m.loginKeyboard.text = ""
  m.loginEmail = ""
  m.loginStep = ""
  m.accountOverlay.visible = false
  m.accountMenuGroup.visible = true
  m.accountLoginGroup.visible = false
  m.rows.setFocus(true)
end sub

sub onAccountPairSelected()
  closeAccountMenu()
  showDeviceActivation()
end sub

sub onAccountUnlinkSelected()
  closeAccountMenu()
  showDeviceActivation()
end sub

sub showAccountLogin()
  if m.deviceToken <> "" then return
  m.accountMenuGroup.visible = false
  m.accountLoginGroup.visible = true
  m.loginEmail = ""
  showLoginStep("email")
end sub

sub showLoginStep(loginMode as string)
  m.loginStep = loginMode
  m.loginStatus.text = ""
  m.loginKeyboard.visible = true
  if loginMode = "password"
    m.loginPrompt.text = "Enter your password"
    m.loginHint.text = "Play/Pause  Sign in     Back  Email     *  Symbols/case"
    m.loginKeyboard.text = ""
    m.loginKeyboard.textEditBox.hintText = "Password"
    m.loginKeyboard.textEditBox.secureMode = true
    m.loginKeyboard.textEditBox.maxTextLength = 128
  else
    m.loginPrompt.text = "Enter your email address"
    m.loginHint.text = "Play/Pause  Continue     Back  Account menu     *  Symbols/case"
    m.loginKeyboard.text = m.loginEmail
    m.loginKeyboard.textEditBox.hintText = "Email address"
    m.loginKeyboard.textEditBox.secureMode = false
    m.loginKeyboard.textEditBox.maxTextLength = 254
  end if
  m.loginKeyboard.setFocus(true)
  scheduleModalFocus()
end sub

sub submitLoginStep()
  if m.loginPending then return
  if m.loginStep = "email"
    email = LCase(m.loginKeyboard.text)
    if email = "" or Instr(0, email, "@") <= 0
      m.loginStatus.text = "Enter a valid email address."
      return
    end if
    m.loginEmail = email
    showLoginStep("password")
    return
  end if
  if m.loginStep <> "password" then return
  password = m.loginKeyboard.text
  if password = ""
    m.loginStatus.text = "Enter your password."
    return
  end if
  m.deviceAction = "login"
  m.deviceGeneration = m.deviceGeneration + 1
  body = FormatJson({ "email": m.loginEmail, "password": password, "deviceType": "ROKU", "displayName": "StreamTumi Roku" })
  m.loginKeyboard.text = ""
  password = ""
  m.loginKeyboard.visible = false
  m.loginPending = true
  m.loginStatus.text = "Signing in securely…"
  m.loginHint.text = "Please wait"
  queueDeviceRequest("login", m.apiOrigin + "/api/device/v1/login", body, "")
end sub

sub showDeviceActivation()
  m.activationOverlay.visible = true
  scheduleModalFocus()
  m.devicePollTimer.control = "stop"
  m.deviceCode = ""
  if m.deviceToken <> ""
    m.activationTitle.text = "This Roku is linked"
    m.activationStatus.text = "Your private rooms and tune history are available on this Roku."
    m.activationCodeLabel.text = "LINKED"
    m.activationUrl.text = "Device access is active"
    m.activationHint.text = "OK  Unlink     Back  Close"
  else
    startDeviceAuthorization()
  end if
end sub

sub startDeviceAuthorization()
  m.devicePollTimer.control = "stop"
  m.deviceCode = ""
  m.devicePollRetryCount = 0
  m.deviceGeneration = m.deviceGeneration + 1
  m.deviceAction = "start"
  m.activationTitle.text = "Link this Roku"
  m.activationStatus.text = "Requesting a secure activation code…"
  m.activationCodeLabel.text = ""
  m.activationUrl.text = ""
  m.activationHint.text = "Back  Close"
  body = FormatJson({ "deviceType": "ROKU", "displayName": "StreamTumi Roku" })
  queueDeviceRequest("start", m.apiOrigin + "/api/device/v1/authorizations", body, "")
end sub

sub scheduleDevicePoll(seconds as integer)
  waitSeconds = seconds
  if waitSeconds < 5 then waitSeconds = 5
  m.devicePollTimer.control = "stop"
  m.devicePollTimer.duration = waitSeconds
  m.devicePollTimer.control = "start"
end sub

function devicePollRetryDelay(attempt as integer) as integer
  if attempt <= 1 then return 5
  if attempt = 2 then return 10
  if attempt = 3 then return 20
  return 30
end function

sub queueDeviceRequest(action as string, url as string, body as string, deviceToken as string)
  m.deviceRequestId = m.deviceRequestId + 1
  m.deviceDesiredRequestId = m.deviceRequestId
  m.deviceQueuedRequestId = m.deviceDesiredRequestId
  m.deviceQueuedAction = action
  m.deviceQueuedUrl = url
  m.deviceQueuedBody = body
  m.deviceQueuedToken = deviceToken
  m.deviceQueuedAuthGeneration = m.authGeneration
  m.deviceQueuedGeneration = m.deviceGeneration
  m.deviceAction = action
  startQueuedDeviceRequest()
end sub

sub startQueuedDeviceRequest()
  if m.deviceActiveRequestId <> 0 or m.deviceQueuedRequestId = 0 then return
  if LCase(m.deviceTask.state) = "run" then return
  m.deviceActiveRequestId = m.deviceQueuedRequestId
  m.deviceActiveAction = m.deviceQueuedAction
  m.deviceActiveAuthGeneration = m.deviceQueuedAuthGeneration
  m.deviceActiveGeneration = m.deviceQueuedGeneration
  m.deviceActiveToken = m.deviceQueuedToken
  m.deviceTask.url = m.deviceQueuedUrl
  m.deviceTask.method = "POST"
  m.deviceTask.body = m.deviceQueuedBody
  m.deviceTask.deviceToken = m.deviceQueuedToken
  m.deviceTask.requestId = m.deviceActiveRequestId
  m.deviceQueuedRequestId = 0
  m.deviceQueuedAction = ""
  m.deviceQueuedUrl = ""
  m.deviceQueuedBody = ""
  m.deviceQueuedToken = ""
  m.deviceTask.control = "run"
end sub

sub onDevicePollTimer()
  if not m.activationOverlay.visible or m.deviceCode = "" then return
  m.deviceAction = "poll"
  body = FormatJson({ "deviceCode": m.deviceCode })
  queueDeviceRequest("poll", m.apiOrigin + "/api/device/v1/token", body, "")
end sub

sub onDeviceTaskCompleted()
  response = m.deviceTask.result
  if response = invalid then return
  if response.requestId = invalid or response.requestId <> m.deviceActiveRequestId then return
  action = m.deviceActiveAction
  authGeneration = m.deviceActiveAuthGeneration
  deviceGeneration = m.deviceActiveGeneration
  requestToken = m.deviceActiveToken
  m.deviceActiveRequestId = 0
  m.deviceActiveAction = ""
  m.deviceActiveToken = ""
  m.deviceTask.body = ""
  if response.requestId <> m.deviceDesiredRequestId then return
  if deviceGeneration <> m.deviceGeneration or authGeneration <> m.authGeneration then return
  if requestToken <> "" and requestToken <> m.deviceToken then return
  if action = "login"
    m.loginPending = false
    if response.ok
      if not setDeviceToken(response.data.deviceToken)
        if m.accountOverlay.visible
          showLoginStep("password")
          m.loginStatus.text = "StreamTumi returned an invalid device session. Try again."
        end if
        return
      end if
      m.account = response.data.account
      m.loginKeyboard.text = ""
      m.loginEmail = ""
      m.loginStep = ""
      if m.accountOverlay.visible
        m.accountMenuGroup.visible = true
        m.accountLoginGroup.visible = false
        updateAccountMenu()
      end if
      loadCatalog(true)
    else if m.accountOverlay.visible
      showLoginStep("password")
      m.loginStatus.text = response.error
    end if
    m.deviceAction = ""
    return
  end if
  if action = "unlink"
    if response.ok or response.status = 401
      clearDeviceToken(authGeneration)
      m.activationTitle.text = "This Roku is unlinked"
      m.activationStatus.text = "Anonymous playback remains available."
      m.activationCodeLabel.text = ""
      m.activationUrl.text = ""
      m.activationHint.text = "OK  Link again     Back  Close"
      loadCatalog(true)
    else
      m.activationStatus.text = "This Roku could not be unlinked. Try again."
      m.activationHint.text = "OK  Try again     Back  Close"
    end if
    m.deviceAction = ""
    return
  end if

  if action = "start"
    if not response.ok
      if response.status <> invalid and response.status > 0
        m.activationStatus.text = "Activation failed (HTTP " + response.status.ToStr() + "). " + response.error
      else
        m.activationStatus.text = "Activation failed. " + response.error
      end if
      m.activationHint.text = "OK  Try again     Back  Close"
      return
    end if
    m.devicePollRetryCount = 0
    m.deviceCode = response.data.deviceCode
    m.activationStatus.text = "On a phone or computer, visit"
    m.activationCodeLabel.text = response.data.userCode
    m.activationUrl.text = response.data.verificationUri
    m.activationHint.text = "Waiting for approval…     Back  Cancel"
    scheduleDevicePoll(response.data.interval)
    return
  end if

  if action = "poll"
    if response.ok
      m.devicePollTimer.control = "stop"
      if not setDeviceToken(response.data.deviceToken)
        m.activationStatus.text = "StreamTumi returned an invalid device session. Request a new code."
        m.activationHint.text = "OK  Get a new code     Back  Close"
        return
      end if
      m.deviceCode = ""
      m.devicePollRetryCount = 0
      m.activationTitle.text = "This Roku is linked"
      m.activationStatus.text = "Private rooms and tune history are now available."
      m.activationCodeLabel.text = "LINKED"
      m.activationUrl.text = "Device access is active"
      m.activationHint.text = "OK  Unlink     Back  Close"
      loadCatalog(true)
      return
    end if
    if response.errorCode = "authorization_pending"
      m.devicePollRetryCount = 0
      interval = 5
      if response.data <> invalid and response.data.interval <> invalid then interval = response.data.interval
      scheduleDevicePoll(interval)
    else if response.errorCode = "slow_down"
      m.devicePollRetryCount = 0
      interval = 10
      if response.data <> invalid and response.data.interval <> invalid then interval = response.data.interval
      m.activationStatus.text = "Still waiting for approval. Polling has slowed down."
      scheduleDevicePoll(interval)
    else if response.errorCode = "expired_token"
      m.deviceCode = ""
      m.activationStatus.text = "That activation code expired."
      m.activationCodeLabel.text = ""
      m.activationUrl.text = ""
      m.activationHint.text = "OK  Get a new code     Back  Close"
    else if response.status = 0 or response.status = 429 or (response.status <> invalid and response.status >= 500)
      if m.devicePollRetryCount < 5
        m.devicePollRetryCount = m.devicePollRetryCount + 1
        m.activationStatus.text = "Activation check unavailable. Retrying without changing your code."
        scheduleDevicePoll(devicePollRetryDelay(m.devicePollRetryCount))
      else
        m.activationStatus.text = "Activation checks are still unavailable. Select OK to try again."
        m.activationHint.text = "OK  Try again     Back  Close"
      end if
    else
      m.activationStatus.text = response.error
      m.activationHint.text = "OK  Try again     Back  Close"
    end if
  end if
end sub

sub onDeviceTaskStateChanged()
  state = LCase(m.deviceTask.state)
  if state = "done" or state = "stop" then startQueuedDeviceRequest()
end sub

sub closeDeviceActivation()
  m.modalFocusTimer.control = "stop"
  m.devicePollTimer.control = "stop"
  m.deviceCode = ""
  m.deviceGeneration = m.deviceGeneration + 1
  m.deviceRequestId = m.deviceRequestId + 1
  m.deviceDesiredRequestId = m.deviceRequestId
  m.deviceQueuedRequestId = 0
  m.deviceQueuedAction = ""
  m.deviceQueuedUrl = ""
  m.deviceQueuedBody = ""
  m.deviceQueuedToken = ""
  m.deviceAction = ""
  if LCase(m.deviceTask.state) = "run" then m.deviceTask.control = "stop"
  m.deviceActiveRequestId = 0
  m.deviceActiveAction = ""
  m.deviceActiveToken = ""
  m.activationOverlay.visible = false
  m.rows.setFocus(true)
end sub

sub unlinkCurrentDevice()
  if m.deviceToken = "" then return
  m.deviceAction = "unlink"
  m.deviceGeneration = m.deviceGeneration + 1
  queueDeviceRequest("unlink", m.apiOrigin + "/api/device/v1/session", "{}", m.deviceToken)
  m.activationStatus.text = "Unlinking this Roku…"
  m.activationHint.text = "Please wait"
end sub

function setDeviceToken(value as dynamic) as boolean
  token = ""
  if value <> invalid then token = value.ToStr()
  if token <> "" and not IsDeviceToken(token) then return false
  if token = m.deviceToken then return true
  m.deviceToken = token
  m.authGeneration = m.authGeneration + 1
  if token = ""
    DeleteSetting("deviceToken")
  else
    SaveTextSetting("deviceToken", token)
  end if
  return true
end function

function clearDeviceToken(expectedGeneration = -1 as integer) as boolean
  if expectedGeneration >= 0 and expectedGeneration <> m.authGeneration then return false
  if not setDeviceToken("") then return false
  m.account = invalid
  m.privateRooms = []
  invalidateWeatherRequests()
  m.tuneTimer.control = "stop"
  m.tuneSessionId = ""
  m.tuneStationToken = ""
  m.tuneSubmitted = false
  m.tuneTimerStarted = false
  return true
end function

sub showRoomEntry()
  m.roomAccessKey = ""
  m.roomPadIndex = 0
  if m.roomAccessAwaiting
    m.roomStatus.text = "Finishing the previous request…"
  else
    m.roomStatus.text = ""
    m.roomAccessCancelled = false
  end if
  updateRoomCodeLabel()
  m.roomOverlay.visible = true
  scheduleModalFocus()
end sub

sub closeRoomEntry()
  m.modalFocusTimer.control = "stop"
  if m.roomAccessAwaiting
    m.roomAccessCancelled = true
    m.roomAccessQueuedRequestId = 0
    m.roomAccessQueuedBody = ""
    m.roomAccessQueuedToken = ""
    if m.roomAccessActiveRequestId = 0 then m.roomAccessAwaiting = false
  end if
  m.roomAccessKey = ""
  m.pendingExplicitRoom = invalid
  m.roomStatus.text = ""
  updateRoomCodeLabel()
  m.roomOverlay.visible = false
  m.rows.setFocus(true)
end sub

sub updateRoomCodeLabel()
  display = ""
  for index = 1 to 6
    if index <= Len(m.roomAccessKey)
      character = Mid(m.roomAccessKey, index, 1)
    else
      character = "_"
    end if
    if display <> "" then display = display + "  "
    display = display + character
  end for
  m.roomCodeLabel.text = display
end sub

sub focusRoomPad(index as integer)
  if index < 0 then index = 0
  if index >= m.roomPadButtons.Count() then index = m.roomPadButtons.Count() - 1
  m.roomPadIndex = index
  updateRoomPadFocus()
end sub

sub updateRoomPadFocus()
  row = Int(m.roomPadIndex / 3)
  column = m.roomPadIndex mod 3
  m.roomFocusRing.translation = [665 + (column * 200), 375 + (row * 100)]
end sub

sub activateRoomPadSelection()
  if m.roomPadIndex < 0 or m.roomPadIndex >= m.roomPadButtons.Count() then return
  activateRoomPadButton(m.roomPadButtons[m.roomPadIndex])
end sub

sub moveRoomPad(key as string)
  row = Int(m.roomPadIndex / 3)
  column = m.roomPadIndex mod 3
  if key = "left"
    column = column - 1
    if column < 0 then column = 2
  else if key = "right"
    column = column + 1
    if column > 2 then column = 0
  else if key = "up"
    row = row - 1
    if row < 0 then row = 3
  else if key = "down"
    row = row + 1
    if row > 3 then row = 0
  end if
  focusRoomPad((row * 3) + column)
end sub

sub onRoomPadSelected(event as object)
  button = event.GetRoSGNode()
  if button = invalid then return
  for index = 0 to m.roomPadButtons.Count() - 1
    if m.roomPadButtons[index] = button then m.roomPadIndex = index
  end for
  activateRoomPadButton(button)
end sub

sub activateRoomPadButton(button as object)
  buttonId = button.id
  if Left(buttonId, 9) = "roomDigit"
    m.pendingExplicitRoom = invalid
    if Len(m.roomAccessKey) < 6 then m.roomAccessKey = m.roomAccessKey + Right(buttonId, 1)
    m.roomStatus.text = ""
    updateRoomCodeLabel()
  else if buttonId = "roomDelete"
    m.pendingExplicitRoom = invalid
    if Len(m.roomAccessKey) > 0 then m.roomAccessKey = Left(m.roomAccessKey, Len(m.roomAccessKey) - 1)
    m.roomStatus.text = ""
    updateRoomCodeLabel()
  else if buttonId = "roomJoin"
    requestRoomAccess()
  end if
end sub

function isSixDigitAccessKey(value as string) as boolean
  if Len(value) <> 6 then return false
  for index = 1 to 6
    code = Asc(Mid(value, index, 1))
    if code < 48 or code > 57 then return false
  end for
  return true
end function

sub requestRoomAccess()
  if m.roomAccessAwaiting then return
  if m.pendingExplicitRoom <> invalid
    pending = m.pendingExplicitRoom
    m.pendingExplicitRoom = invalid
    m.includeExplicit = true
    SaveSetting("includeExplicit", true)
    updateFilterLabels()
    finishRoomAccess(pending)
    return
  end if
  if not isSixDigitAccessKey(m.roomAccessKey)
    m.roomStatus.text = "Enter all six digits before joining."
    return
  end if
  m.roomAccessRetried = false
  m.roomAccessAwaiting = true
  m.roomAccessCancelled = false
  body = FormatJson({ "accessKey": m.roomAccessKey })
  m.roomAccessKey = ""
  updateRoomCodeLabel()
  m.roomStatus.text = "Opening private room…"
  queueRoomAccessRequest(body, m.deviceToken, m.authGeneration)
end sub

sub queueRoomAccessRequest(body as string, deviceToken as string, authGeneration as integer)
  m.roomAccessRequestId = m.roomAccessRequestId + 1
  m.roomAccessDesiredRequestId = m.roomAccessRequestId
  m.roomAccessQueuedRequestId = m.roomAccessDesiredRequestId
  m.roomAccessQueuedBody = body
  m.roomAccessQueuedToken = deviceToken
  m.roomAccessQueuedAuthGeneration = authGeneration
  startQueuedRoomAccessRequest()
end sub

sub startQueuedRoomAccessRequest()
  if m.roomAccessActiveRequestId <> 0 or m.roomAccessQueuedRequestId = 0 then return
  if LCase(m.roomAccessTask.state) = "run" then return
  m.roomAccessActiveRequestId = m.roomAccessQueuedRequestId
  m.roomAccessActiveBody = m.roomAccessQueuedBody
  m.roomAccessActiveToken = m.roomAccessQueuedToken
  m.roomAccessActiveAuthGeneration = m.roomAccessQueuedAuthGeneration
  m.roomAccessQueuedRequestId = 0
  m.roomAccessQueuedBody = ""
  m.roomAccessQueuedToken = ""
  m.roomAccessTask.url = m.apiOrigin + "/api/roku/v2/rooms/access"
  m.roomAccessTask.method = "POST"
  m.roomAccessTask.body = m.roomAccessActiveBody
  m.roomAccessTask.deviceToken = m.roomAccessActiveToken
  m.roomAccessTask.requestId = m.roomAccessActiveRequestId
  m.roomAccessTask.control = "run"
end sub

sub onRoomAccessCompleted()
  response = m.roomAccessTask.result
  if response = invalid then return
  if response.requestId = invalid or response.requestId <> m.roomAccessActiveRequestId then return
  requestBody = m.roomAccessActiveBody
  requestToken = m.roomAccessActiveToken
  authGeneration = m.roomAccessActiveAuthGeneration
  m.roomAccessActiveRequestId = 0
  m.roomAccessActiveBody = ""
  m.roomAccessActiveToken = ""
  if response.requestId <> m.roomAccessDesiredRequestId then return
  if m.roomAccessCancelled
    m.roomAccessTask.body = ""
    m.roomAccessTask.deviceToken = ""
    m.roomAccessAwaiting = false
    if m.roomOverlay.visible
      m.roomAccessCancelled = false
      m.roomStatus.text = ""
    end if
    return
  end if
  if requestToken <> "" and (authGeneration <> m.authGeneration or requestToken <> m.deviceToken)
    m.roomAccessAwaiting = false
    m.roomStatus.text = "The linked account changed. Select Join to try again."
    return
  end if
  if not response.ok and not m.roomAccessRetried and requestToken <> "" and (response.status = 401 or response.status = 403)
    m.roomAccessRetried = true
    clearDeviceToken(authGeneration)
    m.roomStatus.text = "The account link expired. Trying as a guest…"
    queueRoomAccessRequest(requestBody, "", m.authGeneration)
    return
  end if
  m.roomAccessTask.body = ""
  m.roomAccessTask.deviceToken = ""
  m.roomAccessAwaiting = false
  if not response.ok
    m.roomStatus.text = response.error
    return
  end if
  if response.data.station.explicit and not m.includeExplicit
    m.pendingExplicitRoom = response.data
    m.roomStatus.text = "Explicit room. Select Join again to confirm you are 18 or older."
    return
  end if
  finishRoomAccess(response.data)
end sub

sub onRoomAccessTaskStateChanged()
  state = LCase(m.roomAccessTask.state)
  if state = "done" or state = "stop" then startQueuedRoomAccessRequest()
end sub

sub finishRoomAccess(data as object)
  station = data.station
  sessionToken = ""
  if data.roomSessionToken <> invalid then sessionToken = data.roomSessionToken
  closeRoomEntry()
  if sessionToken <> "" and IsRoomSessionToken(sessionToken)
    rememberRoomSession(station, sessionToken)
    beginRoomPlayback(station, "session", sessionToken, "")
  else
    accessUrl = m.apiOrigin + "/api/device/v1/rooms/" + station.id + "/playback"
    beginRoomPlayback(station, "device", "", accessUrl)
  end if
end sub

sub rememberRoomSession(station as object, sessionToken as string)
  tokens = [sessionToken]
  for each token in m.savedRoomTokens
    if token <> sessionToken then tokens.Push(token)
    if tokens.Count() = 12 then exit for
  end for
  m.savedRoomTokens = tokens
  SaveRoomSessionTokens(m.savedRoomTokens)
  upsertGuestRoom(station, sessionToken)
end sub

sub upsertGuestRoom(station as object, sessionToken as string)
  station.rokuRoomKind = "session"
  station.rokuRoomSessionToken = sessionToken
  replaced = false
  for index = 0 to m.guestRooms.Count() - 1
    if m.guestRooms[index].rokuRoomSessionToken = sessionToken
      m.guestRooms[index] = station
      replaced = true
      exit for
    end if
  end for
  if not replaced then m.guestRooms.Push(station)
end sub

sub removeSavedRoomSession(sessionToken as string)
  tokens = []
  for each token in m.savedRoomTokens
    if token <> sessionToken then tokens.Push(token)
  end for
  m.savedRoomTokens = tokens
  SaveRoomSessionTokens(m.savedRoomTokens)
  rooms = []
  for each room in m.guestRooms
    if room.rokuRoomSessionToken <> sessionToken then rooms.Push(room)
  end for
  m.guestRooms = rooms
end sub

sub startSavedRoomResolution()
  if m.savedRoomsLoaded then return
  m.savedRoomsLoaded = true
  m.savedRoomResolveTokens = []
  for each token in m.savedRoomTokens
    m.savedRoomResolveTokens.Push(token)
  end for
  m.savedRoomResolveIndex = 0
  m.savedRoomTokensToKeep = []
  resolveNextSavedRoom()
end sub

sub resolveNextSavedRoom()
  if m.savedRoomActiveRequestId <> 0 or LCase(m.savedRoomTask.state) = "run" then return
  if m.savedRoomResolveIndex >= m.savedRoomResolveTokens.Count()
    for each currentToken in m.savedRoomTokens
      wasStartupToken = false
      for each startupToken in m.savedRoomResolveTokens
        if startupToken = currentToken then wasStartupToken = true
      end for
      if not wasStartupToken then m.savedRoomTokensToKeep.Push(currentToken)
    end for
    m.savedRoomTokens = m.savedRoomTokensToKeep
    SaveRoomSessionTokens(m.savedRoomTokens)
    focused = stationAtFocus()
    focusedId = ""
    if focused <> invalid then focusedId = focused.id
    buildRows(focusedId)
    if stationAtFocus() <> invalid then updateHero(stationAtFocus())
    return
  end if
  m.savedRoomResolvingToken = m.savedRoomResolveTokens[m.savedRoomResolveIndex]
  m.savedRoomRequestId = m.savedRoomRequestId + 1
  m.savedRoomActiveRequestId = m.savedRoomRequestId
  m.savedRoomActiveToken = m.savedRoomResolvingToken
  m.savedRoomTask.url = m.apiOrigin + "/api/roku/v2/rooms/session"
  m.savedRoomTask.method = "POST"
  m.savedRoomTask.body = FormatJson({ "roomSessionToken": m.savedRoomResolvingToken })
  m.savedRoomTask.deviceToken = ""
  m.savedRoomTask.requestId = m.savedRoomActiveRequestId
  m.savedRoomTask.control = "run"
end sub

sub onSavedRoomCompleted()
  response = m.savedRoomTask.result
  if response = invalid then return
  if response.requestId = invalid or response.requestId <> m.savedRoomActiveRequestId then return
  sessionToken = m.savedRoomActiveToken
  m.savedRoomActiveRequestId = 0
  m.savedRoomActiveToken = ""
  m.savedRoomTask.body = ""
  if response.ok
    m.savedRoomTokensToKeep.Push(sessionToken)
    upsertGuestRoom(response.data.station, sessionToken)
  else if response.status <> 400 and response.status <> 404 and response.status <> 410
    m.savedRoomTokensToKeep.Push(sessionToken)
  end if
  m.savedRoomResolveIndex = m.savedRoomResolveIndex + 1
  m.savedRoomAdvancePending = true
end sub

sub onSavedRoomTaskStateChanged()
  state = LCase(m.savedRoomTask.state)
  if state = "done" or state = "stop"
    if m.savedRoomAdvancePending
      m.savedRoomAdvancePending = false
      resolveNextSavedRoom()
    end if
  end if
end sub

sub requestDeviceRoom(station as object, action as string)
  if m.deviceToken = ""
    showError("Link this Roku again to open that private room.")
    return
  end if
  accessUrl = station.accessUrl
  if accessUrl = invalid or accessUrl = "" then accessUrl = station.rokuRoomAccessUrl
  if accessUrl = invalid or accessUrl = ""
    showError("That private room address is unavailable.")
    return
  end if
  if action = "select" then beginPlaybackChange()
  m.privateRoomAction = action
  if action = "select"
    m.loadingText.text = "Opening " + station.name + "…"
    m.loadingOverlay.visible = true
  end if
  m.privateRoomRequestId = m.privateRoomRequestId + 1
  m.privateRoomDesiredRequestId = m.privateRoomRequestId
  m.privateRoomQueuedRequestId = m.privateRoomDesiredRequestId
  m.privateRoomQueuedAction = action
  m.privateRoomQueuedUrl = accessUrl
  m.privateRoomQueuedToken = m.deviceToken
  m.privateRoomQueuedAuthGeneration = m.authGeneration
  m.privateRoomQueuedPlaybackGeneration = m.playbackGeneration
  startQueuedPrivateRoomRequest()
end sub

sub startQueuedPrivateRoomRequest()
  if m.privateRoomActiveRequestId <> 0 or m.privateRoomQueuedRequestId = 0 then return
  if LCase(m.privateRoomTask.state) = "run" then return
  m.privateRoomActiveRequestId = m.privateRoomQueuedRequestId
  m.privateRoomActiveAction = m.privateRoomQueuedAction
  m.privateRoomActiveUrl = m.privateRoomQueuedUrl
  m.privateRoomActiveToken = m.privateRoomQueuedToken
  m.privateRoomActiveAuthGeneration = m.privateRoomQueuedAuthGeneration
  m.privateRoomActivePlaybackGeneration = m.privateRoomQueuedPlaybackGeneration
  m.privateRoomQueuedRequestId = 0
  m.privateRoomQueuedAction = ""
  m.privateRoomQueuedUrl = ""
  m.privateRoomQueuedToken = ""
  m.privateRoomTask.url = m.privateRoomActiveUrl
  m.privateRoomTask.method = "GET"
  m.privateRoomTask.body = ""
  m.privateRoomTask.deviceToken = m.privateRoomActiveToken
  m.privateRoomTask.requestId = m.privateRoomActiveRequestId
  m.privateRoomTask.control = "run"
end sub

sub onPrivateRoomCompleted()
  response = m.privateRoomTask.result
  if response = invalid then return
  if response.requestId = invalid or response.requestId <> m.privateRoomActiveRequestId then return
  action = m.privateRoomActiveAction
  accessUrl = m.privateRoomActiveUrl
  requestToken = m.privateRoomActiveToken
  authGeneration = m.privateRoomActiveAuthGeneration
  playbackGeneration = m.privateRoomActivePlaybackGeneration
  m.privateRoomActiveRequestId = 0
  m.privateRoomActiveAction = ""
  m.privateRoomActiveUrl = ""
  m.privateRoomActiveToken = ""
  m.privateRoomTask.deviceToken = ""
  m.privateRoomAction = ""
  if response.requestId <> m.privateRoomDesiredRequestId then return
  if playbackGeneration <> m.playbackGeneration then return
  if authGeneration <> m.authGeneration or requestToken <> m.deviceToken
    if action = "select" then m.loadingOverlay.visible = false
    return
  end if
  if not response.ok
    if response.status = 401 or response.status = 403 then clearDeviceToken(authGeneration)
    if action = "renew"
      handleRoomRenewError(response)
    else
      m.loadingOverlay.visible = false
      showError(response.error)
    end if
    return
  end if
  if action = "renew"
    applyRenewedRoomDescriptor(response.data.station)
  else
    beginRoomPlayback(response.data.station, "device", "", accessUrl, true)
  end if
end sub

sub onPrivateRoomTaskStateChanged()
  state = LCase(m.privateRoomTask.state)
  if state = "done" or state = "stop" then startQueuedPrivateRoomRequest()
end sub

sub requestGuestRoom(sessionToken as string, action as string)
  if not IsRoomSessionToken(sessionToken)
    showError("That saved room session is invalid.")
    return
  end if
  if action = "select" then beginPlaybackChange()
  m.roomSessionAction = action
  if action = "select"
    m.loadingText.text = "Refreshing private room access…"
    m.loadingOverlay.visible = true
  end if
  m.roomSessionRequestId = m.roomSessionRequestId + 1
  m.roomSessionDesiredRequestId = m.roomSessionRequestId
  m.roomSessionQueuedRequestId = m.roomSessionDesiredRequestId
  m.roomSessionQueuedAction = action
  m.roomSessionQueuedToken = sessionToken
  m.roomSessionQueuedPlaybackGeneration = m.playbackGeneration
  startQueuedRoomSessionRequest()
end sub

sub startQueuedRoomSessionRequest()
  if m.roomSessionActiveRequestId <> 0 or m.roomSessionQueuedRequestId = 0 then return
  if LCase(m.roomSessionTask.state) = "run" then return
  m.roomSessionActiveRequestId = m.roomSessionQueuedRequestId
  m.roomSessionActiveAction = m.roomSessionQueuedAction
  m.roomSessionActiveToken = m.roomSessionQueuedToken
  m.roomSessionActivePlaybackGeneration = m.roomSessionQueuedPlaybackGeneration
  m.roomSessionQueuedRequestId = 0
  m.roomSessionQueuedAction = ""
  m.roomSessionQueuedToken = ""
  m.roomSessionTask.url = m.apiOrigin + "/api/roku/v2/rooms/session"
  m.roomSessionTask.method = "POST"
  m.roomSessionTask.body = FormatJson({ "roomSessionToken": m.roomSessionActiveToken })
  m.roomSessionTask.deviceToken = ""
  m.roomSessionTask.requestId = m.roomSessionActiveRequestId
  m.roomSessionTask.control = "run"
end sub

sub onRoomSessionCompleted()
  response = m.roomSessionTask.result
  if response = invalid then return
  if response.requestId = invalid or response.requestId <> m.roomSessionActiveRequestId then return
  action = m.roomSessionActiveAction
  sessionToken = m.roomSessionActiveToken
  playbackGeneration = m.roomSessionActivePlaybackGeneration
  m.roomSessionActiveRequestId = 0
  m.roomSessionActiveAction = ""
  m.roomSessionActiveToken = ""
  m.roomSessionTask.body = ""
  m.roomSessionAction = ""
  if response.requestId <> m.roomSessionDesiredRequestId then return
  if playbackGeneration <> m.playbackGeneration then return
  if not response.ok
    if response.status = 400 or response.status = 404 or response.status = 410 then removeSavedRoomSession(sessionToken)
    if action = "renew"
      handleRoomRenewError(response)
    else
      m.loadingOverlay.visible = false
      buildRows()
      showError(response.error)
    end if
    return
  end if
  upsertGuestRoom(response.data.station, sessionToken)
  if action = "renew"
    applyRenewedRoomDescriptor(response.data.station)
  else
    beginRoomPlayback(response.data.station, "session", sessionToken, "", true)
  end if
end sub

sub onRoomSessionTaskStateChanged()
  state = LCase(m.roomSessionTask.state)
  if state = "done" or state = "stop" then startQueuedRoomSessionRequest()
end sub

sub setRoomGrantExpiration(value as dynamic)
  m.roomGrantExpiresAt = 0
  if value = invalid or value = "" then return
  expires = CreateObject("roDateTime")
  expires.FromISO8601String(value.ToStr())
  m.roomGrantExpiresAt = expires.AsSeconds()
end sub

function currentEpochSeconds() as integer
  now = CreateObject("roDateTime")
  return now.AsSeconds()
end function

function roomGrantNeedsRenewal() as boolean
  if m.currentRoomType = "" or m.roomGrantExpiresAt <= 0 then return false
  return currentEpochSeconds() + 90 >= m.roomGrantExpiresAt
end function

sub renewCurrentRoomGrant()
  if m.currentRoomType = "" or m.roomRenewing then return
  m.roomRenewing = true
  if m.currentRoomType = "device"
    station = { accessUrl: m.currentRoomAccessUrl, rokuRoomAccessUrl: m.currentRoomAccessUrl, name: m.currentStation.name }
    requestDeviceRoom(station, "renew")
  else
    requestGuestRoom(m.currentRoomSessionToken, "renew")
  end if
end sub

sub applyRenewedRoomDescriptor(station as object)
  station.rokuRoomKind = m.currentRoomType
  if m.currentRoomSessionToken <> "" then station.rokuRoomSessionToken = m.currentRoomSessionToken
  if m.currentRoomAccessUrl <> "" then station.rokuRoomAccessUrl = m.currentRoomAccessUrl
  m.currentStation = station
  m.playerTitle.text = station.name
  setRoomGrantExpiration(station.grantExpiresAt)
  m.roomRenewing = false
  m.roomRestartAfterRefresh = true
  m.refreshingStation = true
  requestCurrentStation()
end sub

sub handleRoomRenewError(response as object)
  m.roomRenewing = false
  fatal = response.status = 400 or response.status = 401 or response.status = 403 or response.status = 404 or response.status = 410
  if fatal
    if m.currentRoomType = "session" then removeSavedRoomSession(m.currentRoomSessionToken)
    message = response.error
    leavePlayer()
    showError(message)
  else
    m.roomGrantExpiresAt = currentEpochSeconds() + 120
  end if
end sub

sub resetCurrentRoomContext()
  m.currentRoomType = ""
  m.currentRoomSessionToken = ""
  m.currentRoomAccessUrl = ""
  m.roomGrantExpiresAt = 0
  m.roomRenewing = false
  m.roomRestartAfterRefresh = false
end sub

function isPrivateStation() as boolean
  return m.currentRoomType <> ""
end function

sub focusFilter(index as integer)
  if index < 0 then index = 0
  if index >= m.filterButtons.Count() then index = m.filterButtons.Count() - 1
  m.filterIndex = index
  m.filterButtons[index].setFocus(true)
end sub

function focusedFilterIndex() as integer
  for index = 0 to m.filterButtons.Count() - 1
    if m.filterButtons[index].hasFocus() then return index
  end for
  return -1
end function

function stationAtFocus() as dynamic
  content = m.rows.content
  focus = m.rows.rowItemFocused
  if content = invalid or focus = invalid or focus.Count() < 2 then return invalid
  row = content.GetChild(focus[0])
  if row = invalid then return invalid
  item = row.GetChild(focus[1])
  if item = invalid then return invalid
  return item.stationData
end function

sub onStationFocused()
  updateHero(stationAtFocus())
end sub

sub updateHero(station as dynamic)
  if station = invalid then return
  isRoom = station.rokuRoomKind <> invalid and station.rokuRoomKind <> ""
  m.heroArtwork.uri = ""
  if station.artworkUrl <> invalid then m.heroArtwork.uri = station.artworkUrl.ToStr()
  kindLabel = "TV"
  if station.stationKind = "RADIO" then kindLabel = "RADIO"
  if isRoom and station.online
    m.heroEyebrow.text = "PRIVATE ROOM · ON AIR · " + kindLabel + " · " + UCase(station.genreName)
  else if isRoom
    m.heroEyebrow.text = "PRIVATE ROOM · OFF AIR · " + UCase(station.genreName)
  else if station.online
    m.heroEyebrow.text = "ON AIR · " + kindLabel + " · " + UCase(station.genreName)
  else
    m.heroEyebrow.text = "OFF AIR · " + UCase(station.genreName)
  end if
  if station.explicit then m.heroEyebrow.text = m.heroEyebrow.text + " · EXPLICIT"
  m.heroTitle.text = station.name
  if station.stationKind = "RADIO" and station.nowPlaying <> invalid
    nowTitle = station.nowPlaying.title
    if station.nowPlaying.artist <> invalid and station.nowPlaying.artist <> "" then nowTitle = nowTitle + " — " + station.nowPlaying.artist
    m.heroDescription.text = nowTitle
  else if station.description = ""
    m.heroDescription.text = "Independent programming from the StreamTumi community."
  else
    m.heroDescription.text = station.description
  end if
  modeText = "TV channel"
  if station.stationKind = "RADIO" then modeText = "Radio station"
  if isRoom
    relationshipText = "Guest access"
    if station.relationship = "OWNER"
      relationshipText = "Owner"
    else if station.relationship = "MEMBER"
      relationshipText = "Member"
    end if
    m.heroMeta.text = "by " + station.ownerName + "    " + modeText + "    " + relationshipText
  else
    m.heroMeta.text = "by " + station.ownerName + "    " + modeText + "    " + station.viewerCount.ToStr() + " viewers    " + station.fanCount.ToStr() + " fans"
  end if
end sub

sub onStationSelected()
  if m.rows.selectPressed <> true then return
  if not m.browseGroup.visible or not m.rows.hasFocus() or m.isPlaying then return
  if m.loadingOverlay.visible or m.errorOverlay.visible or m.accountOverlay.visible or m.activationOverlay.visible or m.roomOverlay.visible then return
  station = stationAtFocus()
  if station = invalid then return
  if station.rokuRoomKind = "device"
    requestDeviceRoom(station, "select")
    return
  else if station.rokuRoomKind = "session"
    requestGuestRoom(station.rokuRoomSessionToken, "select")
    return
  end if
  resetCurrentRoomContext()
  tuneStationDescriptor(station)
end sub

sub beginPlaybackChange()
  m.playbackGeneration = m.playbackGeneration + 1
  invalidateStationRequests()
  invalidateWeatherRequests()
  invalidateChatRequests()
  resetMediaRecovery()
  m.videoPlaybackGeneration = -1
  m.videoStationToken = ""
  m.audioPlaybackGeneration = -1
  m.audioStationToken = ""
  m.transitionPlaybackGeneration = -1
  m.transitionStationToken = ""
  m.radioFallbackPlaybackGeneration = -1
  m.radioFallbackStationToken = ""
  m.transitionTimer.control = "stop"
  m.radioVisualTimer.control = "stop"
  m.privateRoomQueuedRequestId = 0
  m.roomSessionQueuedRequestId = 0
  m.roomRenewing = false
end sub

sub tuneStationDescriptor(station as object, generationStarted = false as boolean)
  if not generationStarted then beginPlaybackChange()
  m.currentStation = station
  m.currentChannelVersion = ""
  m.currentRadioSessionId = ""
  m.radioUsesVisual = false
  m.radioVisualFailedSessionId = ""
  m.radioVisualStarting = false
  m.refreshingStation = false
  m.loadingText.text = "Tuning " + station.name + "…"
  m.loadingOverlay.visible = true
  requestCurrentStation()
end sub

sub beginRoomPlayback(station as object, roomType as string, sessionToken as string, accessUrl as string, generationStarted = false as boolean)
  resetCurrentRoomContext()
  m.currentRoomType = roomType
  m.currentRoomSessionToken = sessionToken
  m.currentRoomAccessUrl = accessUrl
  station.rokuRoomKind = roomType
  if sessionToken <> "" then station.rokuRoomSessionToken = sessionToken
  if accessUrl <> "" then station.rokuRoomAccessUrl = accessUrl
  setRoomGrantExpiration(station.grantExpiresAt)
  tuneStationDescriptor(station, generationStarted)
end sub

sub requestCurrentStation()
  if m.currentStation = invalid then return
  stationUrl = m.currentStation.stationUrl
  if stationUrl = invalid or stationUrl = "" then return
  m.stationRequestId = m.stationRequestId + 1
  m.stationDesiredRequestId = m.stationRequestId
  m.stationQueuedRequestId = m.stationDesiredRequestId
  m.stationQueuedUrl = stationUrl
  m.stationQueuedToken = stationTokenFor(m.currentStation)
  startQueuedStationRequest()
end sub

function stationTokenFor(station as dynamic) as string
  if station = invalid or station.token = invalid then return ""
  return station.token.ToStr()
end function

sub invalidateStationRequests()
  m.stationRequestId = m.stationRequestId + 1
  m.stationDesiredRequestId = m.stationRequestId
  m.stationQueuedRequestId = 0
  m.stationQueuedUrl = ""
  m.stationQueuedToken = ""
end sub

sub startQueuedStationRequest()
  if m.stationActiveRequestId <> 0 or m.stationQueuedRequestId = 0 then return
  if LCase(m.stationTask.state) = "run" then return
  m.stationActiveRequestId = m.stationQueuedRequestId
  m.stationActiveUrl = m.stationQueuedUrl
  m.stationActiveToken = m.stationQueuedToken
  m.stationQueuedRequestId = 0
  m.stationQueuedUrl = ""
  m.stationQueuedToken = ""
  m.stationTask.url = m.stationActiveUrl
  m.stationTask.method = "GET"
  m.stationTask.body = ""
  m.stationTask.deviceToken = ""
  m.stationTask.requestId = m.stationActiveRequestId
  m.stationTask.control = "run"
end sub

function stationRequestMatchesCurrent(requestUrl as string, stationToken as string) as boolean
  if m.currentStation = invalid or m.currentStation.stationUrl = invalid then return false
  if m.currentStation.stationUrl.ToStr() <> requestUrl then return false
  if stationToken <> "" and stationTokenFor(m.currentStation) <> stationToken then return false
  return true
end function

sub onStationLoaded()
  response = m.stationTask.result
  if response = invalid then return
  if response.requestId = invalid or response.requestId <> m.stationActiveRequestId then return
  requestUrl = m.stationActiveUrl
  requestToken = m.stationActiveToken
  m.stationActiveRequestId = 0
  m.stationActiveUrl = ""
  m.stationActiveToken = ""
  if response.requestId <> m.stationDesiredRequestId then return
  if not stationRequestMatchesCurrent(requestUrl, requestToken) then return
  if not response.ok
    if m.tuningStation
      if m.surfAttempts < m.stations.Count()
        surfStation(m.surfDirection, true)
      else
        m.tuningStation = false
        m.surfAttempts = 0
        m.playerStatus.text = "UNAVAILABLE"
        m.playerStatus.color = "#f0b44d"
        m.programTitle.text = "No other public station is available"
        m.video.disableScreenSaver = false
        showPlayerInfoTemporarily()
      end if
      return
    end if
    if m.refreshingStation
      m.refreshingStation = false
      if m.roomRestartAfterRefresh then m.roomGrantExpiresAt = currentEpochSeconds() + 120
      return
    end if
    m.loadingOverlay.visible = false
    showError(response.error)
    return
  end if

  data = response.data
  if data.station <> invalid and data.station.playbackKind = "PERSONALIZED_WEATHER"
    m.stationData = data
    if m.deviceToken = ""
      if m.tuningStation and m.surfAttempts < m.stations.Count()
        surfStation(m.surfDirection, true)
        return
      end if
      m.tuningStation = false
      m.surfAttempts = 0
      m.loadingOverlay.visible = false
      showError("Link this Roku to your StreamTumi account and set a ZIP code in Account settings to watch local weather.")
      return
    end if
    m.loadingText.text = "Starting your 16:9 local weather feed…"
    startWeatherProvision("start")
    return
  end if
  playable = false
  if data.station <> invalid and data.station.stationKind = "RADIO"
    playable = radioStreamAvailable(data)
  else if usesChannelHls(data)
    playable = channelStreamAvailable(data)
  else if data.playlist <> invalid
    playable = data.playlist.Count() > 0
  end if
  if m.tuningStation and (not data.online or not playable)
    if m.surfAttempts < m.stations.Count()
      surfStation(m.surfDirection, true)
    else
      m.tuningStation = false
      m.surfAttempts = 0
      m.playerStatus.text = "UNAVAILABLE"
      m.playerStatus.color = "#f0b44d"
      m.programTitle.text = "No other public station is available"
      m.video.disableScreenSaver = false
      showPlayerInfoTemporarily()
    end if
    return
  end if
  firstLoad = not m.isPlaying
  wasTuning = m.tuningStation
  restartRoom = m.roomRestartAfterRefresh and m.isPlaying
  m.stationData = data
  m.loadingOverlay.visible = false
  if firstLoad or wasTuning
    m.tuningStation = false
    m.surfAttempts = 0
    m.enteredBySurf = wasTuning
    enterPlayer()
  else if restartRoom
    m.roomRestartAfterRefresh = false
    restartRoomPlayer()
  else if data.station.stationKind = "RADIO"
    applyRadioUpdate()
  else if usesChannelHls(data)
    applyChannelUpdate()
  else if data.station.mode = "SYNCHRONIZED"
    applySynchronizedPosition()
  end if
  m.refreshingStation = false
end sub

sub onStationTaskStateChanged()
  state = LCase(m.stationTask.state)
  if state = "done" or state = "stop" then startQueuedStationRequest()
end sub

sub enterPlayer()
  m.isPlaying = true
  if not usesPersonalizedWeather(m.stationData) then beginTuneSession()
  m.catalogTimer.control = "stop"
  m.syncTimer.control = "stop"
  m.transitionTimer.control = "stop"
  m.transitionOverlay.visible = false
  m.video.control = "stop"
  m.audio.control = "stop"
  m.browseGroup.visible = false
  m.errorOverlay.visible = false
  m.playerTitle.text = m.stationData.station.name
  if isPrivateStation()
    m.playerHint.text = "PRIVATE ROOM     Back  Browse     →  Live chat"
  else
    m.playerHint.text = "↑/↓  Change station     →  Live chat"
  end if
  showPlayerInfoTemporarily()
  if usesPersonalizedWeather(m.stationData)
    startWeatherChannel()
    m.syncTimer.control = "start"
  else if m.stationData.station.stationKind = "RADIO"
    if m.stationData.online and radioStreamAvailable(m.stationData)
      startRadio()
      m.syncTimer.control = "start"
    else
      showOfflineSlate()
    end if
  else if usesChannelHls(m.stationData)
    if m.stationData.online and channelStreamAvailable(m.stationData)
      startChannel()
    else
      showOfflineSlate()
    end if
    m.syncTimer.control = "start"
  else if m.stationData.online and m.stationData.playlist.Count() > 0
    m.playerStatus.text = "ON AIR"
    m.playerStatus.color = "#ff4d4f"
    m.currentIndex = 0
    offset = 0
    if m.stationData.position <> invalid
      m.currentIndex = m.stationData.position.index
      offset = m.stationData.position.playbackOffsetMs / 1000.0
      if m.stationData.position.inTransition
        showTransition(m.stationData.position.transitionRemainingMs / 1000.0)
        return
      end if
    end if
    startProgram(m.currentIndex, offset)
    if m.stationData.station.mode = "SYNCHRONIZED" then m.syncTimer.control = "start"
  else
    showOfflineSlate()
  end if
  if isPrivateStation() then m.syncTimer.control = "start"
  if m.chatVisible
    setChatVisible(true)
  else if not m.enteredBySurf and m.chatDefault
    setChatVisible(true)
  end if
  m.enteredBySurf = false
end sub

sub restartRoomPlayer()
  if m.stationData = invalid then return
  if not m.stationData.online
    showOfflineSlate()
  else if m.stationData.station.stationKind = "RADIO"
    if radioStreamAvailable(m.stationData)
      startRadio()
    else
      showOfflineSlate()
    end if
  else if usesChannelHls(m.stationData)
    if channelStreamAvailable(m.stationData)
      startChannel()
    else
      showOfflineSlate()
    end if
  else if m.stationData.playlist <> invalid and m.stationData.playlist.Count() > 0
    index = 0
    offset = 0
    if m.stationData.position <> invalid
      index = m.stationData.position.index
      offset = m.stationData.position.playbackOffsetMs / 1000.0
      if m.stationData.position.inTransition
        showTransition(m.stationData.position.transitionRemainingMs / 1000.0)
        return
      end if
    end if
    startProgram(index, offset)
  else
    showOfflineSlate()
  end if
end sub

function usesPersonalizedWeather(data as dynamic) as boolean
  return data <> invalid and data.station <> invalid and data.station.playbackKind = "PERSONALIZED_WEATHER"
end function

sub invalidateWeatherRequests()
  m.weatherRequestId = m.weatherRequestId + 1
  m.weatherDesiredRequestId = m.weatherRequestId
  m.weatherQueuedRequestId = 0
  m.weatherQueuedTuneId = ""
  m.weatherQueuedStationToken = ""
  m.weatherQueuedAction = ""
  m.weatherQueuedAuthGeneration = 0
  m.weatherQueuedDeviceToken = ""
  m.weatherRetryTimer.control = "stop"
  m.weatherRetryMode = ""
  m.weatherRetryTuneId = ""
  m.weatherRetryStationToken = ""
  m.weatherRetryAction = ""
  m.weatherRetryAuthGeneration = 0
  m.weatherRetryDeviceToken = ""
  m.weatherRetryPlaybackGeneration = -1
  m.weatherFailedTuneId = ""
  m.weatherFailedStationToken = ""
  m.weatherFailedAction = ""
  m.weatherTuning = false
  m.weatherRenewing = false
  m.weatherPlayback = invalid
  m.weatherExpiresAt = 0
  m.weatherTuneId = ""
  m.weatherStationToken = ""
  m.weatherRetryCount = 0
  m.weatherProvisionRetryCount = 0
  m.weatherStartedPlaying = false
  hideWeatherStandby()
  if usesPersonalizedWeather(m.stationData) then m.syncTimer.control = "stop"
end sub

function weatherRequestMatchesCurrent(stationToken as string) as boolean
  if m.currentStation = invalid or stationToken = "" then return false
  if stationTokenFor(m.currentStation) <> stationToken then return false
  return usesPersonalizedWeather(m.stationData)
end function

function playbackContextMatches(playbackGeneration as integer, stationToken as string) as boolean
  if not m.isPlaying or playbackGeneration <> m.playbackGeneration then return false
  if m.currentStation = invalid or stationToken = "" then return false
  return stationTokenFor(m.currentStation) = stationToken
end function

sub startWeatherProvision(action as string, tuneId = "" as string)
  if m.deviceToken = "" or m.currentStation = invalid or not usesPersonalizedWeather(m.stationData) then return
  stationToken = stationTokenFor(m.currentStation)
  if stationToken = "" then return
  if tuneId = ""
    deviceInfo = CreateObject("roDeviceInfo")
    tuneId = deviceInfo.GetRandomUUID()
  end if
  m.weatherTuneId = tuneId
  m.weatherStationToken = stationToken
  m.weatherFailedTuneId = ""
  m.weatherFailedStationToken = ""
  m.weatherFailedAction = ""
  m.weatherRetryTimer.control = "stop"
  m.weatherRetryMode = ""
  if action = "renew"
    m.weatherRenewing = true
  else
    m.weatherTuning = true
  end if
  queueWeatherProvision(tuneId, stationToken, action)
end sub

sub queueWeatherProvision(tuneId as string, stationToken as string, action as string)
  m.weatherRequestId = m.weatherRequestId + 1
  m.weatherDesiredRequestId = m.weatherRequestId
  m.weatherQueuedRequestId = m.weatherDesiredRequestId
  m.weatherQueuedTuneId = tuneId
  m.weatherQueuedStationToken = stationToken
  m.weatherQueuedAction = action
  m.weatherQueuedAuthGeneration = m.authGeneration
  m.weatherQueuedDeviceToken = m.deviceToken
  startQueuedWeatherProvision()
end sub

sub startQueuedWeatherProvision()
  if m.weatherActiveRequestId <> 0 or m.weatherQueuedRequestId = 0 then return
  if LCase(m.weatherTask.state) = "run" then return
  m.weatherActiveRequestId = m.weatherQueuedRequestId
  m.weatherActiveTuneId = m.weatherQueuedTuneId
  m.weatherActiveStationToken = m.weatherQueuedStationToken
  m.weatherActiveAction = m.weatherQueuedAction
  m.weatherActiveAuthGeneration = m.weatherQueuedAuthGeneration
  m.weatherActiveDeviceToken = m.weatherQueuedDeviceToken
  m.weatherQueuedRequestId = 0
  m.weatherQueuedTuneId = ""
  m.weatherQueuedStationToken = ""
  m.weatherQueuedAction = ""
  m.weatherTask.url = m.apiOrigin + "/api/device/v1/tunes"
  m.weatherTask.method = "POST"
  m.weatherTask.body = FormatJson({ "id": m.weatherActiveTuneId, "stationToken": m.weatherActiveStationToken })
  m.weatherTask.deviceToken = m.weatherActiveDeviceToken
  m.weatherTask.requestId = m.weatherActiveRequestId
  m.weatherTask.control = "run"
end sub

function weatherPlaybackExpiration(playback as dynamic) as integer
  if playback = invalid or playback.expiresAt = invalid or playback.expiresAt = "" then return 0
  expires = CreateObject("roDateTime")
  expires.FromISO8601String(playback.expiresAt.ToStr())
  return expires.AsSeconds()
end function

function weatherPlaybackIsValid(playback as dynamic) as boolean
  if playback = invalid or playback.kind = invalid or playback.kind <> "PERSONALIZED_HLS" then return false
  if playback.hlsUrl = invalid or playback.hlsUrl = "" then return false
  return weatherPlaybackExpiration(playback) > currentEpochSeconds()
end function

function weatherRetryDelay(attempt as integer) as integer
  if attempt <= 1 then return 2
  if attempt = 2 then return 4
  return 8
end function

sub scheduleWeatherProvisionRetry(tuneId as string, stationToken as string, action as string)
  m.weatherProvisionRetryCount = m.weatherProvisionRetryCount + 1
  m.weatherRetryMode = "provision"
  m.weatherRetryTuneId = tuneId
  m.weatherRetryStationToken = stationToken
  m.weatherRetryAction = action
  m.weatherRetryAuthGeneration = m.weatherActiveAuthGeneration
  m.weatherRetryDeviceToken = m.weatherActiveDeviceToken
  m.weatherRetryPlaybackGeneration = m.playbackGeneration
  m.weatherRetryTimer.control = "stop"
  m.weatherRetryTimer.duration = weatherRetryDelay(m.weatherProvisionRetryCount)
  m.weatherRetryTimer.control = "start"
end sub

sub failWeatherProvision(response as object, tuneId as string, stationToken as string, action as string)
  hideWeatherStandby()
  m.weatherTuning = false
  m.weatherRenewing = false
  m.weatherRetryMode = ""
  m.weatherFailedTuneId = tuneId
  m.weatherFailedStationToken = stationToken
  m.weatherFailedAction = action
  if action = "start" and m.tuningStation and m.surfAttempts < m.stations.Count()
    surfStation(m.surfDirection, true)
    return
  end if
  if action = "start"
    m.tuningStation = false
    m.surfAttempts = 0
  end if
  m.loadingOverlay.visible = false
  if response.errorCode = "WEATHER_LOCATION_REQUIRED"
    showError("Set your ZIP code in StreamTumi Account settings, then try this channel again.")
  else
    showError(response.error)
  end if
end sub

sub onWeatherProvisioned()
  response = m.weatherTask.result
  if response = invalid then return
  if response.requestId = invalid or response.requestId <> m.weatherActiveRequestId then return
  tuneId = m.weatherActiveTuneId
  stationToken = m.weatherActiveStationToken
  action = m.weatherActiveAction
  authGeneration = m.weatherActiveAuthGeneration
  deviceToken = m.weatherActiveDeviceToken
  m.weatherActiveRequestId = 0
  m.weatherActiveTuneId = ""
  m.weatherActiveStationToken = ""
  m.weatherActiveAction = ""
  if response.requestId <> m.weatherDesiredRequestId then return
  if not weatherRequestMatchesCurrent(stationToken) then return
  if authGeneration <> m.authGeneration or deviceToken <> m.deviceToken then return

  if not response.ok
    if response.status = 401 or response.status = 403
      clearDeviceToken(authGeneration)
      m.loadingOverlay.visible = false
      showError("Link this Roku again to start your local weather feed.")
      return
    end if
    retryable = response.status = 0
    if response.status <> invalid and response.status >= 500 then retryable = true
    if retryable and m.weatherProvisionRetryCount < 3
      m.weatherActiveAuthGeneration = authGeneration
      m.weatherActiveDeviceToken = deviceToken
      scheduleWeatherProvisionRetry(tuneId, stationToken, action)
      return
    end if
    failWeatherProvision(response, tuneId, stationToken, action)
    return
  end if

  playback = invalid
  if response.data <> invalid then playback = response.data.playback
  if not weatherPlaybackIsValid(playback)
    invalidResponse = { ok: false, status: response.status, error: "The weather service returned incomplete or expired playback details.", errorCode: "WEATHER_PLAYBACK_INVALID" }
    failWeatherProvision(invalidResponse, tuneId, stationToken, action)
    return
  end if

  m.weatherTask.body = ""
  m.weatherTask.deviceToken = ""
  m.weatherProvisionRetryCount = 0
  m.weatherRetryTimer.control = "stop"
  m.weatherRetryMode = ""
  m.weatherRetryAuthGeneration = 0
  m.weatherRetryDeviceToken = ""
  m.weatherRetryPlaybackGeneration = -1
  m.weatherFailedTuneId = ""
  m.weatherFailedStationToken = ""
  m.weatherFailedAction = ""
  m.weatherTuning = false
  m.weatherRenewing = false
  m.weatherTuneId = tuneId
  m.weatherStationToken = stationToken
  m.weatherPlayback = playback
  m.weatherExpiresAt = weatherPlaybackExpiration(playback)
  m.loadingOverlay.visible = false

  if action = "start"
    wasTuning = m.tuningStation
    m.tuningStation = false
    m.surfAttempts = 0
    m.enteredBySurf = wasTuning
    enterPlayer()
  else if m.isPlaying
    startWeatherChannel()
    m.syncTimer.control = "start"
  end if
end sub

sub onWeatherTaskStateChanged()
  state = LCase(m.weatherTask.state)
  if state = "done" or state = "stop" then startQueuedWeatherProvision()
end sub

function weatherNeedsRenewal() as boolean
  if not usesPersonalizedWeather(m.stationData) or m.weatherExpiresAt <= 0 then return false
  return currentEpochSeconds() + 300 >= m.weatherExpiresAt
end function

sub renewWeatherPlayback()
  if m.weatherTuning or m.weatherRenewing or m.weatherFailedTuneId <> "" then return
  m.weatherProvisionRetryCount = 0
  startWeatherProvision("renew")
end sub

sub handleWeatherVideoFailure()
  if not m.isPlaying or not usesPersonalizedWeather(m.stationData) then return
  if m.weatherPlayback = invalid or m.weatherRetryMode <> "" or m.weatherTuning or m.weatherRenewing then return
  if m.weatherRetryCount < 3
    m.weatherRetryCount = m.weatherRetryCount + 1
    m.weatherRetryMode = "media"
    m.weatherRetryStationToken = m.weatherStationToken
    m.weatherRetryAuthGeneration = m.authGeneration
    m.weatherRetryDeviceToken = m.deviceToken
    m.weatherRetryPlaybackGeneration = m.playbackGeneration
    m.weatherRetryTimer.control = "stop"
    m.weatherRetryTimer.duration = weatherRetryDelay(m.weatherRetryCount)
    m.weatherRetryTimer.control = "start"
    m.playerStatus.text = "RECONNECTING"
    m.playerStatus.color = "#f0b44d"
    showWeatherStandby("Reconnecting to your local forecast…")
    return
  end if
  m.weatherRetryCount = 0
  m.weatherProvisionRetryCount = 0
  startWeatherProvision("recover")
end sub

sub showWeatherStandby(message as string)
  m.weatherStandbyStatus.text = message
  m.weatherStandby.visible = true
end sub

sub hideWeatherStandby()
  m.weatherStandby.visible = false
end sub

sub onWeatherRetryTimer()
  retryMode = m.weatherRetryMode
  tuneId = m.weatherRetryTuneId
  stationToken = m.weatherRetryStationToken
  action = m.weatherRetryAction
  authGeneration = m.weatherRetryAuthGeneration
  deviceToken = m.weatherRetryDeviceToken
  playbackGeneration = m.weatherRetryPlaybackGeneration
  m.weatherRetryMode = ""
  if playbackGeneration <> m.playbackGeneration then return
  if authGeneration <> m.authGeneration or deviceToken <> m.deviceToken then return
  if not weatherRequestMatchesCurrent(stationToken) then return
  if retryMode = "media"
    startWeatherChannel()
  else if retryMode = "provision"
    queueWeatherProvision(tuneId, stationToken, action)
  end if
end sub

sub startWeatherChannel()
  if m.weatherPlayback = invalid or m.weatherPlayback.hlsUrl = invalid or m.weatherPlayback.hlsUrl = ""
    showOfflineSlate()
    return
  end if
  m.currentChannelVersion = m.weatherPlayback.sessionId
  m.weatherStartedPlaying = false
  showWeatherStandby("Starting your local WeatherStar feed…")
  m.audio.control = "stop"
  m.radioVisual.visible = false
  m.video.disableScreenSaver = true
  content = CreateObject("roSGNode", "ContentNode")
  content.url = m.weatherPlayback.hlsUrl
  content.streamFormat = "hls"
  content.title = "Your local forecast"
  m.videoPlaybackGeneration = m.playbackGeneration
  m.videoStationToken = stationTokenFor(m.currentStation)
  m.audioPlaybackGeneration = -1
  m.audioStationToken = ""
  m.video.content = content
  m.video.width = 1920
  m.video.height = 1080
  m.video.visible = true
  m.playerSlate.visible = false
  m.transitionOverlay.visible = false
  m.playerStatus.text = "ON AIR"
  m.playerStatus.color = "#ff4d4f"
  m.programTitle.text = "Your local forecast / WeatherStar 4000+ 16:9"
  m.video.control = "play"
  m.video.setFocus(true)
  showPlayerInfoTemporarily()
end sub

sub startProgram(index as integer, offset = 0 as float)
  if m.stationData = invalid or m.stationData.playlist = invalid or m.stationData.playlist.Count() = 0 then return
  if index < 0 or index >= m.stationData.playlist.Count() then index = 0
  item = m.stationData.playlist[index]
  m.currentChannelVersion = ""
  m.currentIndex = index
  m.currentVideoId = item.id
  m.currentRadioSessionId = ""
  m.radioUsesVisual = false
  m.radioVisualStarting = false
  m.audio.control = "stop"
  m.radioVisual.visible = false
  m.video.disableScreenSaver = true
  content = CreateObject("roSGNode", "ContentNode")
  content.url = AbsoluteUrl(UrlOrigin(m.currentStation.stationUrl), item.hlsUrl)
  content.streamFormat = "hls"
  content.title = item.title
  content.playStart = offset
  m.videoPlaybackGeneration = m.playbackGeneration
  m.videoStationToken = stationTokenFor(m.currentStation)
  m.audioPlaybackGeneration = -1
  m.audioStationToken = ""
  m.video.content = content
  m.video.width = 1920
  m.video.height = 1080
  m.video.visible = true
  m.playerSlate.visible = false
  m.transitionOverlay.visible = false
  m.programTitle.text = item.title
  m.video.control = "play"
  m.video.setFocus(true)
  showPlayerInfoTemporarily()
  if m.chatVisible then setChatVisible(true)
end sub

function usesChannelHls(data as dynamic) as boolean
  if data = invalid or data.delivery = invalid then return false
  return data.delivery.mode = "CHANNEL_HLS"
end function

function channelStreamAvailable(data as dynamic) as boolean
  if not usesChannelHls(data) then return false
  if data.delivery.status <> "AVAILABLE" then return false
  return data.delivery.hlsUrl <> invalid and data.delivery.hlsUrl <> ""
end function

sub startChannel()
  if not channelStreamAvailable(m.stationData) then return
  m.currentChannelVersion = m.stationData.delivery.version
  m.currentRadioSessionId = ""
  m.radioUsesVisual = false
  m.radioVisualStarting = false
  m.audio.control = "stop"
  m.radioVisual.visible = false
  m.video.disableScreenSaver = true
  content = CreateObject("roSGNode", "ContentNode")
  content.url = AbsoluteUrl(UrlOrigin(m.currentStation.stationUrl), m.stationData.delivery.hlsUrl)
  content.streamFormat = "hls"
  content.title = channelProgramTitle()
  m.videoPlaybackGeneration = m.playbackGeneration
  m.videoStationToken = stationTokenFor(m.currentStation)
  m.audioPlaybackGeneration = -1
  m.audioStationToken = ""
  m.video.content = content
  m.video.width = 1920
  m.video.height = 1080
  m.video.visible = true
  m.playerSlate.visible = false
  m.transitionOverlay.visible = false
  m.playerStatus.text = "ON AIR"
  m.playerStatus.color = "#ff4d4f"
  applyChannelPosition()
  m.video.control = "play"
  m.video.setFocus(true)
  showPlayerInfoTemporarily()
  if m.chatVisible then setChatVisible(true)
end sub

function channelProgramTitle() as string
  title = m.stationData.station.name
  if m.stationData.program = invalid then return title
  if m.stationData.program.title <> invalid and m.stationData.program.title <> "" then title = m.stationData.program.title
  return title
end function

sub applyChannelPosition()
  m.programTitle.text = channelProgramTitle()
  if m.video.content <> invalid then m.video.content.title = m.programTitle.text
  if m.stationData.program <> invalid
    if m.stationData.program.kind = "TV_AUTOMATION" and m.stationData.program.itemId <> invalid
      m.currentVideoId = m.stationData.program.itemId
      return
    end if
  end if
  if m.stationData.position = invalid or m.stationData.playlist = invalid then return
  index = m.stationData.position.index
  if index < 0 or index >= m.stationData.playlist.Count() then return
  m.currentIndex = index
  item = m.stationData.playlist[index]
  m.currentVideoId = item.id
  if m.stationData.position.inTransition <> invalid and m.stationData.position.inTransition
    m.programTitle.text = "Transition between programs"
  else
    m.programTitle.text = item.title
  end if
end sub

sub applyChannelUpdate()
  if not m.stationData.online or not channelStreamAvailable(m.stationData)
    m.currentChannelVersion = ""
    showOfflineSlate()
    return
  end if
  if m.stationData.delivery.version <> m.currentChannelVersion or (m.video.state <> "playing" and m.video.state <> "buffering")
    startChannel()
  else
    applyChannelPosition()
  end if
end sub

function radioAudioStreamAvailable(data as dynamic) as boolean
  if data = invalid or data.stream = invalid then return false
  if data.stream.status <> "AVAILABLE" then return false
  return data.stream.audioHlsUrl <> invalid and data.stream.audioHlsUrl <> ""
end function

function radioVisualStreamAvailable(data as dynamic) as boolean
  if data = invalid or data.stream = invalid then return false
  if data.stream.status <> "AVAILABLE" then return false
  if data.stream.visualHlsUrl = invalid or data.stream.visualHlsUrl = "" then return false
  if m.radioVisualFailedSessionId <> "" and data.stream.sessionId <> invalid and data.stream.sessionId = m.radioVisualFailedSessionId then return false
  return true
end function

function radioStreamAvailable(data as dynamic) as boolean
  return radioVisualStreamAvailable(data) or radioAudioStreamAvailable(data)
end function

sub startRadio()
  if not radioStreamAvailable(m.stationData) then return
  m.video.disableScreenSaver = true
  m.radioVisualTimer.control = "stop"
  m.radioVisualStarting = false
  m.radioUsesVisual = false
  m.video.control = "stop"
  m.audio.control = "stop"
  m.videoPlaybackGeneration = -1
  m.videoStationToken = ""
  m.audioPlaybackGeneration = -1
  m.audioStationToken = ""
  m.video.visible = false
  m.radioVisual.visible = false
  m.playerSlate.visible = false
  m.transitionOverlay.visible = false
  m.currentRadioSessionId = ""
  if m.stationData.stream.sessionId <> invalid then m.currentRadioSessionId = m.stationData.stream.sessionId
  m.radioUsesVisual = radioVisualStreamAvailable(m.stationData)
  content = CreateObject("roSGNode", "ContentNode")
  content.streamFormat = "hls"
  content.title = m.stationData.station.name
  updateRadioMetadata()
  if m.radioUsesVisual
    m.radioVisualStarting = true
    m.videoPlaybackGeneration = m.playbackGeneration
    m.videoStationToken = stationTokenFor(m.currentStation)
    m.radioFallbackPlaybackGeneration = m.playbackGeneration
    m.radioFallbackStationToken = m.videoStationToken
    content.url = AbsoluteUrl(UrlOrigin(m.currentStation.stationUrl), m.stationData.stream.visualHlsUrl)
    m.video.content = content
    if m.chatVisible
      m.video.width = 1400
    else
      m.video.width = 1920
    end if
    m.video.height = 1080
    m.video.visible = true
    m.video.control = "play"
    m.video.setFocus(true)
    m.radioVisualTimer.control = "start"
  else
    m.audioPlaybackGeneration = m.playbackGeneration
    m.audioStationToken = stationTokenFor(m.currentStation)
    m.radioFallbackPlaybackGeneration = -1
    m.radioFallbackStationToken = ""
    content.url = AbsoluteUrl(UrlOrigin(m.currentStation.stationUrl), m.stationData.stream.audioHlsUrl)
    m.audio.content = content
    m.radioVisual.visible = true
    m.audio.control = "play"
    m.playerKeyCatcher.setFocus(true)
  end if
  showPlayerInfoTemporarily()
end sub

sub fallbackRadioToAudio()
  if not playbackContextMatches(m.radioFallbackPlaybackGeneration, m.radioFallbackStationToken) then return
  if m.stationData = invalid or m.stationData.stream = invalid then return
  if m.stationData.stream.sessionId <> invalid then m.radioVisualFailedSessionId = m.stationData.stream.sessionId
  m.radioVisualStarting = false
  m.radioVisualTimer.control = "stop"
  startRadio()
end sub

sub onRadioVisualTimeout()
  if not playbackContextMatches(m.radioFallbackPlaybackGeneration, m.radioFallbackStationToken) then return
  if m.radioUsesVisual and m.video.state <> "playing" then fallbackRadioToAudio()
end sub

sub updateRadioMetadata()
  playback = m.stationData.playback
  title = m.stationData.station.name
  artist = "Live radio"
  context = ""
  artwork = ""
  if m.currentStation.artworkUrl <> invalid then artwork = m.currentStation.artworkUrl.ToStr()
  if playback <> invalid
    if playback.title <> invalid and playback.title <> "" then title = playback.title
    if playback.artist <> invalid and playback.artist <> "" then artist = playback.artist
    if playback.artworkUrl <> invalid and playback.artworkUrl <> ""
      artwork = AbsoluteUrl(UrlOrigin(m.currentStation.stationUrl), playback.artworkUrl.ToStr())
    end if
    if playback.show <> invalid and playback.show.active and playback.show.showTitle <> invalid
      context = playback.show.showTitle
    else if playback.blockName <> invalid and playback.blockName <> ""
      context = playback.blockName
    else if playback.playlistName <> invalid
      context = playback.playlistName
    end if
  end if
  if m.stationData.next <> invalid and m.stationData.next.title <> invalid
    nextText = m.stationData.next.title
    if m.stationData.next.artist <> invalid and m.stationData.next.artist <> "" then nextText = nextText + " — " + m.stationData.next.artist
    if context <> "" then context = context + "     "
    context = context + "Next: " + nextText
  end if
  m.radioArtwork.uri = artwork
  m.radioKind.text = "RADIO · ON AIR"
  m.radioTrackTitle.text = title
  m.radioArtist.text = artist
  m.radioContext.text = context
  m.playerStatus.text = "RADIO · ON AIR"
  m.playerStatus.color = "#ff4d4f"
  m.playerTitle.text = m.stationData.station.name
  m.programTitle.text = artist + " — " + title
end sub

sub applyRadioUpdate()
  updateRadioMetadata()
  sessionId = ""
  if m.stationData.stream.sessionId <> invalid then sessionId = m.stationData.stream.sessionId
  if sessionId <> "" and sessionId <> m.currentRadioSessionId
    m.radioVisualFailedSessionId = ""
    startRadio()
    return
  end if
  shouldUseVisual = radioVisualStreamAvailable(m.stationData)
  if shouldUseVisual <> m.radioUsesVisual
    startRadio()
  else if m.radioUsesVisual
    if m.video.state <> "playing" and m.video.state <> "buffering" then startRadio()
  else if m.audio.state <> "playing" and m.audio.state <> "buffering"
    startRadio()
  end if
end sub

sub applySynchronizedPosition()
  if usesChannelHls(m.stationData) then return
  if m.stationData.position = invalid then return
  if m.currentChannelVersion <> "" then m.currentVideoId = ""
  m.currentChannelVersion = ""
  if m.stationData.position.inTransition
    showTransition(m.stationData.position.transitionRemainingMs / 1000.0)
    return
  end if
  index = m.stationData.position.index
  expected = m.stationData.position.playbackOffsetMs / 1000.0
  item = m.stationData.playlist[index]
  if item.id <> m.currentVideoId
    startProgram(index, expected)
  else if Abs(m.video.position - expected) > 30
    m.video.seek = expected
  end if
end sub

sub showOfflineSlate()
  resetMediaRecovery()
  m.videoPlaybackGeneration = -1
  m.videoStationToken = ""
  m.audioPlaybackGeneration = -1
  m.audioStationToken = ""
  m.video.disableScreenSaver = false
  m.video.control = "stop"
  m.audio.control = "stop"
  m.video.visible = false
  m.radioVisual.visible = false
  m.playerSlate.visible = true
  m.playerSlate.uri = m.currentStation.slateUrl
  m.playerStatus.text = "OFF AIR"
  m.playerStatus.color = "#a1a1aa"
  m.programTitle.text = "This station is currently off air"
  m.playerKeyCatcher.setFocus(true)
end sub

sub showTransition(seconds as float)
  m.video.control = "stop"
  m.audio.control = "stop"
  m.video.visible = false
  m.radioVisual.visible = false
  m.playerSlate.visible = false
  m.transitionOverlay.visible = true
  m.transitionPlaybackGeneration = m.playbackGeneration
  m.transitionStationToken = stationTokenFor(m.currentStation)
  waitSeconds = seconds
  if waitSeconds < 0.2 then waitSeconds = 0.2
  m.transitionTimer.control = "stop"
  m.transitionTimer.duration = waitSeconds
  m.transitionTimer.control = "start"
  if isPrivateStation() then m.syncTimer.control = "start"
  m.playerKeyCatcher.setFocus(true)
end sub

sub onTransitionTimer()
  if not playbackContextMatches(m.transitionPlaybackGeneration, m.transitionStationToken) then return
  m.transitionOverlay.visible = false
  if m.stationData = invalid or m.stationData.station = invalid then return
  if m.stationData.station.mode = "SYNCHRONIZED"
    m.refreshingStation = true
    requestCurrentStation()
  else
    startProgram(m.currentIndex, 0)
  end if
end sub

function mediaRetryDelay(attempt as integer) as integer
  if attempt <= 1 then return 2
  if attempt = 2 then return 4
  if attempt = 3 then return 8
  return 16
end function

sub resetMediaRecovery()
  m.mediaRetryTimer.control = "stop"
  m.mediaRetryCount = 0
  m.mediaRetryMode = ""
  m.mediaRetryPlaybackGeneration = -1
  m.mediaRetryStationToken = ""
  m.mediaFailedMode = ""
end sub

sub failMediaRecovery(mode as string)
  m.mediaRetryTimer.control = "stop"
  m.mediaRetryMode = ""
  m.mediaFailedMode = mode
  m.video.disableScreenSaver = false
  m.video.control = "stop"
  m.audio.control = "stop"
  m.playerKeyCatcher.setFocus(true)
  showError("Playback stopped after repeated stream errors. Select Try again to reconnect.")
end sub

sub scheduleMediaRecovery(mode as string)
  stationToken = ""
  if m.currentStation <> invalid then stationToken = stationTokenFor(m.currentStation)
  if not playbackContextMatches(m.playbackGeneration, stationToken) or usesPersonalizedWeather(m.stationData) then return
  if m.mediaRetryMode <> "" then return
  if m.mediaRetryCount >= 4
    failMediaRecovery(mode)
    return
  end if
  m.mediaRetryCount = m.mediaRetryCount + 1
  m.mediaRetryMode = mode
  m.mediaRetryPlaybackGeneration = m.playbackGeneration
  m.mediaRetryStationToken = stationToken
  m.playerStatus.text = "RECONNECTING"
  m.playerStatus.color = "#f0b44d"
  m.mediaRetryTimer.control = "stop"
  m.mediaRetryTimer.duration = mediaRetryDelay(m.mediaRetryCount)
  m.mediaRetryTimer.control = "start"
end sub

sub restartMedia(mode as string)
  if mode = "channel"
    startChannel()
  else if mode = "radio"
    startRadio()
  else if mode = "legacy"
    startProgram(m.currentIndex, 0)
  end if
end sub

sub onMediaRetryTimer()
  mode = m.mediaRetryMode
  playbackGeneration = m.mediaRetryPlaybackGeneration
  stationToken = m.mediaRetryStationToken
  m.mediaRetryMode = ""
  if not playbackContextMatches(playbackGeneration, stationToken) then return
  if m.stationData = invalid then return
  restartMedia(mode)
end sub

sub onVideoStateChanged()
  if not playbackContextMatches(m.videoPlaybackGeneration, m.videoStationToken) then return
  state = m.video.state
  if state = "playing"
    if usesPersonalizedWeather(m.stationData)
      m.weatherStartedPlaying = true
      hideWeatherStandby()
      m.weatherRetryCount = 0
      if m.weatherRetryMode = "media"
        m.weatherRetryTimer.control = "stop"
        m.weatherRetryMode = ""
      end if
    else
      resetMediaRecovery()
      startTuneTimer()
    end if
    m.video.setFocus(true)
    if m.radioUsesVisual
      m.radioVisualStarting = false
      m.radioVisualTimer.control = "stop"
    end if
  end if
  if usesPersonalizedWeather(m.stationData) and state = "buffering" and not m.weatherStartedPlaying
    showWeatherStandby("Buffering the first forecast frames…")
  end if
  if state = "paused" and m.isPlaying then m.video.control = "resume"
  if usesPersonalizedWeather(m.stationData) and (state = "error" or state = "finished")
    handleWeatherVideoFailure()
    return
  end if
  if m.stationData <> invalid and m.stationData.station.stationKind = "RADIO"
    if m.radioUsesVisual and (state = "error" or (state = "finished" and not m.radioVisualStarting))
      if isPrivateStation() and roomGrantNeedsRenewal()
        renewCurrentRoomGrant()
      else
        fallbackRadioToAudio()
      end if
    end if
    return
  end if
  if usesChannelHls(m.stationData) and (state = "error" or state = "finished")
    if isPrivateStation() and roomGrantNeedsRenewal()
      renewCurrentRoomGrant()
    else
      scheduleMediaRecovery("channel")
    end if
    return
  end if
  if state = "error"
    scheduleMediaRecovery("legacy")
    return
  end if
  if state = "finished"
    if m.stationData = invalid or m.stationData.playlist.Count() = 0 then return
    if m.stationData.station.mode = "SYNCHRONIZED"
      m.refreshingStation = true
      requestCurrentStation()
    else
      m.currentIndex = (m.currentIndex + 1) mod m.stationData.playlist.Count()
      transitionMs = 0
      if m.stationData.station.transitionMs <> invalid then transitionMs = m.stationData.station.transitionMs
      if transitionMs > 0
        showTransition(transitionMs / 1000.0)
      else
        startProgram(m.currentIndex, 0)
      end if
    end if
  end if
end sub

sub onAudioStateChanged()
  if not playbackContextMatches(m.audioPlaybackGeneration, m.audioStationToken) then return
  state = m.audio.state
  if state = "playing"
    resetMediaRecovery()
    m.playerKeyCatcher.setFocus(true)
    startTuneTimer()
  end if
  if state = "paused" and m.isPlaying then m.audio.control = "resume"
  if state = "error" or state = "finished"
    if isPrivateStation()
      if roomGrantNeedsRenewal() then renewCurrentRoomGrant()
    else
      scheduleMediaRecovery("radio")
    end if
  end if
end sub

sub surfStation(direction as integer, continuing = false as boolean)
  if m.stations = invalid or m.stations.Count() < 2
    m.programTitle.text = "Only one public station is online"
    showPlayerInfoTemporarily()
    return
  end if
  if not continuing then m.surfAttempts = 0
  resetTuneSession()

  currentIndex = -1
  for index = 0 to m.stations.Count() - 1
    if m.currentStation <> invalid and m.stations[index].token = m.currentStation.token
      currentIndex = index
      exit for
    end if
  end for

  if currentIndex < 0
    nextIndex = 0
  else
    nextIndex = currentIndex + direction
    if nextIndex < 0 then nextIndex = m.stations.Count() - 1
    if nextIndex >= m.stations.Count() then nextIndex = 0
  end if

  m.surfDirection = direction
  m.surfAttempts = m.surfAttempts + 1
  m.tuningStation = true
  beginPlaybackChange()
  m.currentStation = m.stations[nextIndex]
  m.refreshingStation = false
  m.stationData = invalid
  m.currentVideoId = ""
  m.currentChannelVersion = ""
  m.currentRadioSessionId = ""
  m.radioUsesVisual = false
  m.radioVisualFailedSessionId = ""
  m.radioVisualStarting = false
  m.radioVisualTimer.control = "stop"
  m.syncTimer.control = "stop"
  m.transitionTimer.control = "stop"
  m.transitionOverlay.visible = false
  m.video.control = "stop"
  m.audio.control = "stop"
  m.video.visible = false
  m.radioVisual.visible = false
  m.playerSlate.visible = false
  m.playerStatus.text = "TUNING"
  m.playerStatus.color = "#f0b44d"
  m.playerTitle.text = m.currentStation.name
  m.programTitle.text = "Connecting to station…"
  showPlayerInfoTemporarily()
  m.playerKeyCatcher.setFocus(true)
  requestCurrentStation()
end sub

sub onSyncTimer()
  if m.isPlaying and usesPersonalizedWeather(m.stationData)
    if weatherNeedsRenewal() then renewWeatherPlayback()
    return
  end if
  if m.isPlaying and isPrivateStation() and roomGrantNeedsRenewal()
    renewCurrentRoomGrant()
    return
  end if
  if m.isPlaying and m.stationData <> invalid and m.stationData.station.mode = "SYNCHRONIZED"
    m.refreshingStation = true
    requestCurrentStation()
  end if
end sub

sub setChatVisible(visible as boolean)
  m.chatVisible = visible
  m.chatPanel.visible = visible
  if visible
    m.video.width = 1400
    loadChat()
    m.chatTimer.control = "start"
  else
    m.video.width = 1920
    m.chatTimer.control = "stop"
    invalidateChatRequests()
    if m.video.visible
      m.video.setFocus(true)
    else if m.radioVisual.visible
      m.playerKeyCatcher.setFocus(true)
    end if
  end if
end sub

sub clearChatContent()
  m.chatList.content = CreateObject("roSGNode", "ContentNode")
  m.chatState.text = ""
end sub

sub invalidateChatRequests()
  m.chatRequestId = m.chatRequestId + 1
  m.chatDesiredRequestId = m.chatRequestId
  m.chatQueuedRequestId = 0
  m.chatQueuedUrl = ""
  m.chatQueuedStationToken = ""
  m.chatQueuedPlaybackGeneration = -1
  clearChatContent()
end sub

sub loadChat()
  if m.currentStation = invalid or m.currentStation.chatUrl = invalid or m.currentStation.chatUrl = "" then return
  m.chatState.text = "Refreshing…"
  m.chatRequestId = m.chatRequestId + 1
  m.chatDesiredRequestId = m.chatRequestId
  m.chatQueuedRequestId = m.chatDesiredRequestId
  m.chatQueuedUrl = m.currentStation.chatUrl.ToStr()
  m.chatQueuedStationToken = stationTokenFor(m.currentStation)
  m.chatQueuedPlaybackGeneration = m.playbackGeneration
  startQueuedChatRequest()
end sub

sub startQueuedChatRequest()
  if m.chatActiveRequestId <> 0 or m.chatQueuedRequestId = 0 then return
  if LCase(m.chatTask.state) = "run" then return
  m.chatActiveRequestId = m.chatQueuedRequestId
  m.chatActiveUrl = m.chatQueuedUrl
  m.chatActiveStationToken = m.chatQueuedStationToken
  m.chatActivePlaybackGeneration = m.chatQueuedPlaybackGeneration
  m.chatQueuedRequestId = 0
  m.chatQueuedUrl = ""
  m.chatQueuedStationToken = ""
  m.chatTask.url = m.chatActiveUrl
  m.chatTask.method = "GET"
  m.chatTask.body = ""
  m.chatTask.deviceToken = ""
  m.chatTask.requestId = m.chatActiveRequestId
  m.chatTask.control = "run"
end sub

sub onChatTimer()
  if m.isPlaying and m.chatVisible then loadChat()
end sub

sub onChatLoaded()
  response = m.chatTask.result
  if response = invalid then return
  if response.requestId = invalid or response.requestId <> m.chatActiveRequestId then return
  chatUrl = m.chatActiveUrl
  stationToken = m.chatActiveStationToken
  playbackGeneration = m.chatActivePlaybackGeneration
  m.chatActiveRequestId = 0
  m.chatActiveUrl = ""
  m.chatActiveStationToken = ""
  m.chatActivePlaybackGeneration = -1
  if response.requestId <> m.chatDesiredRequestId then return
  if not m.isPlaying or not m.chatVisible or playbackGeneration <> m.playbackGeneration then return
  if m.currentStation = invalid or stationTokenFor(m.currentStation) <> stationToken then return
  if m.currentStation.chatUrl = invalid or m.currentStation.chatUrl.ToStr() <> chatUrl then return
  if not response.ok
    m.chatState.text = response.error
    return
  end if
  content = CreateObject("roSGNode", "ContentNode")
  pinnedIds = {}
  if response.data.pinned <> invalid
    for each message in response.data.pinned
      item = content.CreateChild("ContentNode")
      item.title = message.body
      item.shortDescriptionLine1 = message.authorName
      item.shortDescriptionLine2 = "PINNED"
      item.AddField("avatarUrl", "string", false)
      if message.avatarUrl <> invalid and message.avatarUrl <> "" then item.avatarUrl = AbsoluteUrl(UrlOrigin(chatUrl), message.avatarUrl)
      pinnedIds[message.id] = true
    end for
  end if
  if response.data.messages <> invalid
    startAt = 0
    if response.data.messages.Count() > 50 then startAt = response.data.messages.Count() - 50
    for index = startAt to response.data.messages.Count() - 1
      message = response.data.messages[index]
      if pinnedIds[message.id] = invalid
        item = content.CreateChild("ContentNode")
        item.title = message.body
        item.shortDescriptionLine1 = message.authorName
        roleLabel = "GUEST"
        if message.authorKind = "HOST"
          roleLabel = "HOST"
        else if message.authorKind = "REGISTERED"
          roleLabel = "MEMBER"
        end if
        item.shortDescriptionLine2 = roleLabel
        item.AddField("avatarUrl", "string", false)
        if message.avatarUrl <> invalid and message.avatarUrl <> "" then item.avatarUrl = AbsoluteUrl(UrlOrigin(chatUrl), message.avatarUrl)
      end if
    end for
  end if
  m.chatList.content = content
  if content.GetChildCount() = 0
    m.chatState.text = "No messages yet"
  else
    m.chatState.text = content.GetChildCount().ToStr() + " recent messages"
    m.chatList.jumpToItem = content.GetChildCount() - 1
  end if
end sub

sub onChatTaskStateChanged()
  state = LCase(m.chatTask.state)
  if state = "done" or state = "stop" then startQueuedChatRequest()
end sub

sub beginTuneSession()
  resetTuneSession()
  if m.deviceToken = "" or m.currentStation = invalid or isPrivateStation() then return
  deviceInfo = CreateObject("roDeviceInfo")
  m.tuneSessionId = deviceInfo.GetRandomUUID()
  m.tuneStationToken = stationTokenFor(m.currentStation)
end sub

sub startTuneTimer()
  if usesPersonalizedWeather(m.stationData) then return
  if m.deviceToken = "" or m.tuneSessionId = "" or m.tuneSubmitted or m.tuneTimerStarted or isPrivateStation() then return
  m.tuneTimerStarted = true
  m.tuneTimer.control = "start"
end sub

sub resetTuneSession()
  m.tuneTimer.control = "stop"
  m.tuneSessionId = ""
  m.tuneStationToken = ""
  m.tuneSubmitted = false
  m.tuneTimerStarted = false
end sub

sub onTuneTimer()
  submitTuneSession()
end sub

sub submitTuneSession()
  if m.deviceToken = "" or m.tuneSessionId = "" or m.tuneStationToken = "" or m.tuneSubmitted or isPrivateStation() then return
  if LCase(m.tuneTask.state) = "run" then return
  m.tuneSubmitted = true
  m.tuneRequestId = m.tuneRequestId + 1
  m.tuneActiveRequestId = m.tuneRequestId
  m.tuneActiveAuthGeneration = m.authGeneration
  m.tuneTask.url = m.apiOrigin + "/api/device/v1/tunes"
  m.tuneTask.method = "POST"
  m.tuneTask.body = FormatJson({ "id": m.tuneSessionId, "stationToken": m.tuneStationToken })
  m.tuneTask.deviceToken = m.deviceToken
  m.tuneTask.requestId = m.tuneActiveRequestId
  m.tuneTask.control = "run"
end sub

sub onTuneSubmitted()
  response = m.tuneTask.result
  if response = invalid then return
  if response.requestId = invalid or response.requestId <> m.tuneActiveRequestId then return
  authGeneration = m.tuneActiveAuthGeneration
  m.tuneActiveRequestId = 0
  if not response.ok
    if response.status = 401 or response.status = 403 then clearDeviceToken(authGeneration)
  end if
end sub

sub leavePlayer()
  beginPlaybackChange()
  resetTuneSession()
  m.video.disableScreenSaver = false
  m.video.control = "stop"
  m.audio.control = "stop"
  m.video.visible = false
  m.radioVisual.visible = false
  m.playerSlate.visible = false
  m.playerShade.visible = false
  m.playerInfo.visible = false
  m.transitionOverlay.visible = false
  setChatVisible(false)
  m.syncTimer.control = "stop"
  m.weatherRetryTimer.control = "stop"
  m.weatherStartedPlaying = false
  hideWeatherStandby()
  m.transitionTimer.control = "stop"
  m.playerInfoTimer.control = "stop"
  m.isPlaying = false
  m.currentStation = invalid
  m.stationData = invalid
  m.currentVideoId = ""
  m.currentChannelVersion = ""
  m.currentRadioSessionId = ""
  m.refreshingStation = false
  m.tuningStation = false
  m.surfAttempts = 0
  m.enteredBySurf = false
  m.radioUsesVisual = false
  m.radioVisualFailedSessionId = ""
  m.radioVisualStarting = false
  m.radioVisualTimer.control = "stop"
  resetCurrentRoomContext()
  m.browseGroup.visible = true
  m.rows.setFocus(true)
  m.catalogTimer.control = "start"
  loadCatalog(true)
end sub

sub showError(message as string)
  m.loadingOverlay.visible = false
  m.errorMessage.text = message
  m.errorOverlay.visible = true
  m.retryButton.setFocus(true)
end sub

sub onRetry()
  m.errorOverlay.visible = false
  if m.mediaFailedMode <> "" and playbackContextMatches(m.mediaRetryPlaybackGeneration, m.mediaRetryStationToken)
    mode = m.mediaFailedMode
    m.mediaRetryCount = 0
    m.mediaFailedMode = ""
    restartMedia(mode)
    return
  end if
  if m.weatherFailedTuneId <> "" and weatherRequestMatchesCurrent(m.weatherFailedStationToken)
    tuneId = m.weatherFailedTuneId
    action = m.weatherFailedAction
    m.weatherProvisionRetryCount = 0
    m.loadingText.text = "Starting your 16:9 local weather feed…"
    m.loadingOverlay.visible = action = "start"
    startWeatherProvision(action, tuneId)
    return
  end if
  if m.currentStation <> invalid and not m.browseGroup.visible
    requestCurrentStation()
  else
    loadCatalog(false)
  end if
end sub

sub onCatalogTimer()
  if not m.isPlaying then loadCatalog(true)
end sub

sub onPlayerKeyPressed()
  handlePlayerKey(m.playerKeyCatcher.keyPressed)
end sub

sub onVideoKeyPressed()
  handlePlayerKey(m.video.keyPressed)
end sub

sub showPlayerInfoTemporarily()
  if not m.isPlaying then return
  m.playerShade.visible = true
  m.playerInfo.visible = true
  m.playerInfoTimer.control = "stop"
  m.playerInfoTimer.control = "start"
end sub

sub hidePlayerInfo()
  if not m.isPlaying then return
  m.playerShade.visible = false
  m.playerInfo.visible = false
end sub

function handlePlayerKey(key as string) as boolean
  showPlayerInfoTemporarily()
  if key = "back"
    if m.chatVisible
      setChatVisible(false)
    else
      leavePlayer()
    end if
    return true
  else if key = "options" or key = "info"
    setChatVisible(not m.chatVisible)
    return true
  else if key = "right"
    if m.chatVisible
      m.chatList.setFocus(true)
    else
      setChatVisible(true)
    end if
    return true
  else if key = "left" and m.chatVisible
    setChatVisible(false)
    return true
  else if key = "up" and not m.chatList.hasFocus()
    if isPrivateStation()
      m.programTitle.text = "Private rooms are not included in public station surfing"
    else
      surfStation(-1)
    end if
    return true
  else if key = "down" and not m.chatList.hasFocus()
    if isPrivateStation()
      m.programTitle.text = "Private rooms are not included in public station surfing"
    else
      surfStation(1)
    end if
    return true
  else if key = "play" or key = "OK" or key = "select" or key = "fastforward" or key = "rewind" or key = "replay"
    if m.radioVisual.visible
      if m.audio.state = "paused" then m.audio.control = "resume"
    else if m.video.state = "paused"
      m.video.control = "resume"
    end if
    return true
  end if
  return false
end function

function onKeyEvent(key as string, press as boolean) as boolean
  if not press then return false
  if m.errorOverlay.visible then return false

  if m.roomOverlay.visible
    if key = "back" or key = "options" or key = "info"
      closeRoomEntry()
    else if key = "left" or key = "right" or key = "up" or key = "down"
      moveRoomPad(key)
    else if key = "OK" or key = "select" or key = "play"
      activateRoomPadSelection()
    end if
    return true
  end if

  if m.accountOverlay.visible
    if m.accountLoginGroup.visible
      if m.loginPending
        return true
      else if key = "info"
        closeAccountMenu()
      else if key = "back"
        if m.loginStep = "password"
          showLoginStep("email")
        else
          m.loginKeyboard.text = ""
          m.loginStep = ""
          m.accountLoginGroup.visible = false
          m.accountMenuGroup.visible = true
          updateAccountMenu()
          scheduleModalFocus()
        end if
      else if key = "play"
        submitLoginStep()
      end if
    else
      if key = "back" or key = "options" or key = "info"
        closeAccountMenu()
      else if key = "up" or key = "left"
        focusAccountMenu(m.accountMenuIndex - 1)
      else if key = "down" or key = "right"
        focusAccountMenu(m.accountMenuIndex + 1)
      end if
    end if
    return true
  end if

  if m.activationOverlay.visible
    if key = "back" or key = "options"
      closeDeviceActivation()
    else if key = "OK" or key = "select"
      if m.deviceAction = "unlink"
        return true
      else if m.deviceToken <> ""
        unlinkCurrentDevice()
      else if m.deviceCode <> ""
        m.devicePollRetryCount = 0
        onDevicePollTimer()
      else
        startDeviceAuthorization()
      end if
    end if
    return true
  end if

  if m.isPlaying
    return handlePlayerKey(key)
  end if

  if key = "options" or key = "info"
    showAccountMenu()
    return true
  end if

  filterIndex = focusedFilterIndex()
  if key = "up" and m.rows.hasFocus()
    focus = m.rows.rowItemFocused
    if focus <> invalid and focus[0] = 0
      focusFilter(m.filterIndex)
      return true
    end if
  else if key = "down" and filterIndex >= 0
    m.rows.setFocus(true)
    return true
  else if key = "left" and filterIndex >= 0
    focusFilter(filterIndex - 1)
    return true
  else if key = "right" and filterIndex >= 0
    focusFilter(filterIndex + 1)
    return true
  end if
  return false
end function
