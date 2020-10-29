const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const router = express.Router();
const appleToken = require('../models/appletoken.js');
const fetch = require('node-fetch');
const isrc = require ('../models/isrc.js')
const servisongID = require('../models/songID.js');
const apiID = require ('../config.json');
const cors = require('cors');
router.use(cors());

const dbURI =apiID.dbURI
mongoose.connect(dbURI, { useNewUrlParser: true, useUnifiedTopology: true})
  .then((result)=> console.log('connected to db'))
  .catch((err)=> console.log(err));


router.post('/getAppleISRC', (req, res) => {
    const playlistURI = req.body.url
    let catalogID =0;//uses catalog id instead of library id
    const authToken = req.body.authToken.appleToken
    if (playlistURI.includes("pl.u")){
        preurl= 'https://api.music.apple.com/v1/catalog/us/playlists/'
        fullURL=preurl.concat(playlistURI)
        catalogID=1;
    } 
    const getPlaylistTracks = async () =>{
        const preurl = 'https://api.music.apple.com/v1/me/library/playlists/'
        const lasturl = '/tracks?include=catalog'
        const fullURL = preurl.concat(playlistURI + lasturl)
        const songs = await fetch(fullURL,{
            method: 'GET',
            headers: {
                'authorization': apiID.appleAuth,
                'music-user-token': authToken
            }
        })
        return songs.json()
    }

    const sendIsrc = async () => {
        const songs = await getPlaylistTracks()
        let total
        if (catalogID == 0){
            total=songs.meta.total
        }else if (catalogID == 1){
             total=songs.data[0].relationships.tracks.data.length
        }
        for(i = 0; i<total; i++){
            try{
                var isISRC = songs.data[i].relationships.catalog.data[0].attributes.isrc
                var trackN = songs.data[i].attributes.name
                var albumN = songs.data[i].attributes.albumName
            } catch (err){
                console.log(err)
            }
            albumN= albumN.split(' - ')
            albumN= albumN[0]
            if (catalogID == 1){
                try{
                    isISRC= songs.data[0].relationships.tracks.data[i].attributes.isrc
                    trackN= songs.data[0].relationships.tracks.data[i].attributes.name
                    albumN= songs.data[0].relationships.tracks.data[i].attributes.albumName
                } catch(err) {
                    console.log(err)
                }
                albumN= albumN.split(' - ')
                albumN= albumN[0]
            }
            var isrcInstance = new isrc({
                isrc: isISRC,
                trackName: trackN,
                num: i,
                id: req.body.id.idA2S,
                album: albumN
              });
            
            isrcInstance.save()
           
        }
        console.log('isrc codes saved')
        res.send({done: 'done'})

    }

    sendIsrc()

})


router.post('/createApplePlaylist', (req, res) =>{
    console.log('request started')
    const requestID = req.body.id.id
    const token = req.body.authToken.appleToken
    var playID = ''
    const playName = req.body.playlist
    const createplaylist = async () =>{
        const createPlay = await fetch ('https://api.music.apple.com/v1/me/library/playlists',{//create apple playlist
            method: 'POST',
            headers:{
                'authorization': apiID.appleAuth,
                'music-user-token':token
            },
            body: JSON.stringify({
                "attributes":{
                "name" : playName,
                "description": "Created by Playlist Converter"
                }
            })
        })
        return createPlay.json()
    }

    const numofIsrc = async () => {
        const playlist = await createplaylist()
        playID = playlist.data[0].id
        const numofSongs = await isrc.countDocuments({id: requestID})
        return numofSongs
    }
    

    const getAppleCode = async () => {
        const numofSongs = await numofIsrc()
        for (i = 0; i< numofSongs; i++){
            const isrcCodes = await isrc.find({id: requestID, num: i})
            const preurl =  'https://api.music.apple.com/v1/catalog/us/songs?filter[isrc]='
            try{
                var isrcCode = isrcCodes[0].isrc
                var albumIsrc = isrcCodes[0].album
            } catch (err) {
                console.log(err)
            }
            
            const url = preurl.concat(isrcCode);
            const appleCode = await fetch(url,{
                method: 'GET',
                headers: {
                'authorization': apiID.appleAuth
                },
              
              })
            
            const codes = await appleCode.json()
            let counter = 0
            try{
                var albumName = codes.data[0].attributes.albumName
                var duplicateSongs = codes.data.length 
                var songName = codes.data[0].attributes.name
                var songID = codes.data[0].id
            } catch (err){
                console.log(err)
            }
            

            if (duplicateSongs > 1){
                      
                albumName = albumName.split(' - ')
                albumName = albumName[0].split(' (EP)')
                albumName = albumName[0].toUpperCase();
                albumIsrc = albumIsrc.toUpperCase();
               

                if (albumName != albumIsrc){
                  counter++;
                
                  albumName = codes.data[counter].attributes.albumName
                  albumName = albumName.split(' - ')
                  albumName = albumName[0].split(' (EP)')
                  albumName = albumName[0]
                  albumName = albumName.toUpperCase();
                  albumIsrc = albumIsrc.toUpperCase();
                  if (albumName == albumIsrc){
                    try{
                        name = codes.data[counter].attributes.name
                        id = codes.data[counter].id
                    } catch (err) {
                        console.log(err)
                    }
                  }
                  
                }
            }

            var newSongId = new servisongID({
                songID: songID,
                num: i,
                name: songName,
                id: requestID
            })

            const transferred = await newSongId.save()
            if (transferred.num == numofSongs-1 ){
                return true
            }

            }
    }

  
    const getnumofCodes = async () => {
        const prevhasFinished = await getAppleCode()
        if (prevhasFinished) {
            const numofSongIDs = await servisongID.countDocuments({id: requestID})
            return numofSongIDs
        }
    }

    const addSongs = async () => {
            const numofSongs = await getnumofCodes()
            for (i = 0; i<numofSongs; i++){
                const songID = await servisongID.find({id: requestID, num: i})
                const playlistID = playID
                const tracks = "/tracks";
                const preUrl = 'https://api.music.apple.com/v1/me/library/playlists/'
                const url = preUrl.concat(playlistID, tracks)
                try{
                    var id = songID[0].songID
                } catch(err){
                    console.log(err)
                }
               
                fetch (url,{
                    method: 'POST',
                    headers: {
                      'authorization': apiID.appleAuth,
                      'music-user-token': token
                    },
                    body: JSON.stringify( {
                      "data":[{
                          "id": id,
                          "type":"songs"
                      }]
                    })
                })
                
                if (i == numofSongs-1) {
                    console.log('added' + (i) + 'tracks to playlist')
                    return numofSongs
                }
            }
        }

  
        const finishRequest = async () => {
            const numofSongs = await addSongs()
            if (numofSongs !=0){
                res.send({done:("Done! Added " + numofSongs + " tracks to " + playName), link:"https://music.apple.com/library/playlist/"+playID})
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
            if (!prevhasFinished) {
                res.send({done: 'Error, Please Try Again'})

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