const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const router = express.Router();
var SpotifyWebApi = require('spotify-web-api-node');
const isrc = require('../models/isrc.js');
const spotifyToken = require('../models/spotifytoken.js')
const servisongID = require('../models/songID.js');
const fetch = require('node-fetch');
const cors = require('cors');
const { response } = require('express');
const apiID = require ('../config.json');
router.use(cors());

const dbURI = apiID.dbURI
const clientId = apiID.clientId
const clientSecret =  apiID.clientSecret
const redirectUri =  apiID.redirectURI
mongoose.connect(dbURI || process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true})
  .then((result)=> console.log('connected to db'))
  .catch((err)=> console.log(err));

var spotifyApi = new SpotifyWebApi({
    clientId: clientId,
    clientSecret: clientSecret,
    redirectUri: redirectUri
  })

router.get("/authorize", function (req, res) {
    var authorizeURL = 'https://accounts.spotify.com/authorize?client_id='+ apiID.clientId +'&response_type=token&redirect_uri='+apiID.redirectURI+'&scope=playlist-read-private%20user-top-read&state=null&show_dialog=true';
    res.send(authorizeURL)
})

router.post('/getSpotifyISRC', (req, res) => {
    const getPlaylistTracks = async () =>{
        spotifyApi.setAccessToken(req.body.authToken.spotifyToken)
        const plTracks = await spotifyApi.getPlaylistTracks(req.body.url)
        const requestID = req.body.id.id
        return [plTracks, requestID]
    }

    getPlaylistTracks()
        .then((trackList)=>{//save tracks in dB
            var numofSongs = 0;
            const tracks = trackList[0].body.items
            const requestID = trackList[1]

            tracks.forEach((track) => {//save tracks and isrcs
                let isrcCode = track.track.external_ids.isrc
                let trackName = track.track.name
                let albumName = track.track.album.name
                

                var isrcInstance = new isrc({
                    isrc: isrcCode,
                    trackName: trackName,
                    num: numofSongs,
                    id: requestID,
                    album: albumName
                })
                numofSongs++
                isrcInstance.save()
            })

        }).catch((err)=>{
            console.log(err)
        })
        console.log('isrc codes saved')
        res.send({done: 'done'})
        


})

router.post('/createSpotifyPlaylist', (req, res)=>{
    console.log('request started')
    const playlistName = req.body.createplaylist
    const requestID = req.body.id.idA2S
    var playlistID = ''
    spotifyApi.setAccessToken(req.body.authToken.spotifyToken)

    const createPlaylist = async () => {
        const newPlaylist = await spotifyApi.createPlaylist(playlistName, { 'description': 'Created with Playlist Converter', 'public': false})
        playlistID = newPlaylist.body.id
        return playlistID
        
    } 

    const getSongIsrc = async ()=>{
        const playID = await createPlaylist()
        const numofSongs = await isrc.countDocuments()
        return numofSongs
        
    }



    const convertISRC = async()=>{
        const values =  await getSongIsrc()
        
            for (i = 0; i < values; i++){
                let searchHeader = 'isrc:'
                let counter = 0
                const isrcData = await isrc.find({id: requestID, num:i}) 
                try{
                    var isrcCode = isrcData[0].isrc
                    var isrcAlbum = isrcData[0].album
                } catch(err){
                    console.log(err)
                }
                
                let url = searchHeader.concat(isrcCode)
                try{
                    var trackID = await spotifyApi.searchTracks(url)
                    var responseAlbum = trackID.body.tracks.items[0].album.name
                    var repeatSong = trackID.body.tracks.items.length////get song from album in playlist, rather than repackage, etc
                    var trackName = trackID.body.tracks.items[0].name
                    var songID = trackID.body.tracks.items[0].uri
                } catch (err){
                    console.log(err)
                }
                
                if (repeatSong > 1){//check if song is from correct album
                     if (responseAlbum != isrcAlbum){
                        counter ++
                        try {
                            responseAlbum = trackID.body.tracks.items[counter].album.name
                        } catch (err) {
                            console.log(err)
                        }
                        if (responseAlbum == isrcAlbum){
                            try {
                                trackName = trackID.body.tracks.items[counter].name
                                songID = trackID.body.tracks.items[counter].uri
                            } catch (err) {
                                console.log(err)
                            }
                            
                            }
                        }
                    }
        
                    var serviceSongID = new servisongID({//convert to music service id
                        songID: songID,
                        num: i,
                        name: trackName,
                        id: requestID
                    })
                    
                    try{
                        var transferred = await serviceSongID.save()
                    } catch (err) {
                        console.log(err)
                    }
                    
                    if (transferred.num == values-1){
                        return true
                    }
                    
                }
        
    }

    
    const getSpotifyID = async () =>{
        const prevhasFinished = await convertISRC()
        if(prevhasFinished){
            const numofSongs = await servisongID.countDocuments({id: requestID})
            return numofSongs
        }
    }

   

    const addtoPlaylist = async () => {
        const numofSongs = await getSpotifyID()
        let requestArray = ["placeholder"];
        for (i = 0; i < numofSongs; i++){
            const songData = await servisongID.find({id: requestID, num: i})
            try{
                requestArray[i] = songData[0].songID
            } catch(err){
                console.log(err)
            }
            
            if (i == numofSongs-1){
                
                spotifyApi.addTracksToPlaylist(playlistID, requestArray).then(()=>{
                    console.log('Added ' + i+1 + 'tracks to playlist');
                }).catch((err)=>{
                    console.log('Something went wrong!', err)
                })
                return numofSongs
            }
        }
        
    }



    const finishRequest = async () =>{
        const numofSongs = await addtoPlaylist()
        
        if (numofSongs != 0){
            res.send({link:'https://open.spotify.com/playlist/'+playlistID, done:("Done! Added " + numofSongs + " tracks to " + playlistName) })
            return true
        } else{
            return false
        }
        
    }


    const deleteDb = async () => {
        const prevhasFinished = await finishRequest()
        if (prevhasFinished){
            isrc.deleteMany({id: requestID}, function (err, result){
                if (err) {
                    console.log(err);
                }else{
                    console.log("isrc db cleared")
                    
                }
              })
            servisongID.deleteMany({id: requestID}, function (err, result){
                if (err) {
                    console.log(err);
                } else{
                    console.log("songid db cleared")
                    
                }
              })
        } 
        if (!prevhasFinished){
            res.send({done:'Error, please try again'})

            isrc.deleteMany({id: requestID}, function (err, result){
                if (err) {
                    console.log(err);
                }else{
                    console.log("isrc db cleared")
                    
                }
              })
            servisongID.deleteMany({id: requestID}, function (err, result){
                if (err) {
                    console.log(err);
                } else{
                    console.log("songid db cleared")
                    
                }
              })
        }
        
    }

    deleteDb()
})

module.exports = router;