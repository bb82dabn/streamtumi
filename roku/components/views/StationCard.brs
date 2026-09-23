sub init()
  m.artwork = m.top.findNode("artwork")
  m.title = m.top.findNode("title")
  m.meta = m.top.findNode("meta")
  m.live = m.top.findNode("live")
  m.focusRing = m.top.findNode("focusRing")
end sub

sub onContentChanged()
  content = m.top.itemContent
  if content = invalid then return
  uri = content.HDPosterUrl
  if uri = invalid or uri = "" then uri = content.FHDPosterUrl
  m.artwork.uri = uri
  m.title.text = content.title
  m.meta.text = content.shortDescriptionLine1
  if content.stationData <> invalid and content.stationData.rokuRoomKind <> invalid and content.shortDescriptionLine2 = "ON AIR"
    m.live.text = "ROOM"
    m.live.color = "#ff4d4f"
  else if content.shortDescriptionLine2 = "ON AIR"
    if content.stationData <> invalid and content.stationData.stationKind = "RADIO"
      m.live.text = "RADIO"
    else
      m.live.text = "LIVE"
    end if
    m.live.color = "#ff4d4f"
  else
    m.live.text = "OFF"
    m.live.color = "#a1a1aa"
  end if
end sub

sub onFocusChanged()
  focused = m.top.focusPercent > 0.5
  m.focusRing.visible = focused
  if focused
    m.top.scale = [1.04, 1.04]
  else
    m.top.scale = [1.0, 1.0]
  end if
end sub
