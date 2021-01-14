# playlist-converter
Allows the conversion of playlists to and from Spotify and Apple Music with the use of service specific song IDs and ISRC codes

Known bugs: On occasion, Spotify and Apple Music do not use the same ISRC code for a song, which prevents said song from being converted, which causes a duplicate of another song to be added. Planning a fix using album and song names in those cases.

QoL changes: If the transfer of ALL songs fails, a playlist is still created. Working on a change that will delete the playlist. Most likely would occur with service exclusive songs.

V1.0
  -Initial Release
  
For Client/Front End Code:
  https://github.com/AlexOei/playlistconv-client
