module Volare.Handler.MSM (
    getSurfaceR,
    getBarometricR
) where

import Control.Applicative ((<$>))
import Control.Monad (when)
import Control.Monad.IO.Class (liftIO)
import qualified Data.Aeson as JSON
import qualified Data.Text as T
import qualified Service.MSM as MSM
import System.Directory (createDirectoryIfMissing,
                         doesFileExist)
import System.FilePath (takeDirectory)
import Text.Printf (printf)
import Text.Read (readMaybe)
import Yesod.Core.Handler (lookupGetParam,
                           notFound)

import Volare.Foundation


getSurfaceR :: Int ->
               Int ->
               Int ->
               Int ->
               Handler JSON.Value
getSurfaceR = getData True MSM.getSurfaceItems


getBarometricR :: Int ->
                  Int ->
                  Int ->
                  Int ->
                  Handler JSON.Value
getBarometricR = getData False MSM.getBarometricItems


getData :: JSON.ToJSON a =>
           Bool ->
           (FilePath -> (Float, Float) -> (Float, Float) -> Int -> IO a) ->
           Int ->
           Int ->
           Int ->
           Int ->
           Handler JSON.Value
getData surface f year month day hour = do
  nwLatitude <- (>>= readMaybe . T.unpack) <$> lookupGetParam "nwlat"
  nwLongitude <- (>>= readMaybe . T.unpack) <$> lookupGetParam "nwlng"
  seLatitude <- (>>= readMaybe . T.unpack) <$> lookupGetParam "selat"
  seLongitude <- (>>= readMaybe . T.unpack) <$> lookupGetParam "selng"
  case (nwLatitude, nwLongitude, seLatitude, seLongitude) of
    (Just nwLat, Just nwLng, Just seLat, Just seLng) -> do
      path <- liftIO $ dataFile surface year month day
      liftIO $ JSON.toJSON <$> f path (nwLat, nwLng) (seLat, seLng) hour
    _ -> notFound


dataFile :: Bool ->
            Int ->
            Int ->
            Int ->
            IO FilePath
dataFile surface year month day = do
  let t = if surface then 's' else 'p'
      path = printf "./data/msm/%c/%04d%02d%02d.nc" t year month day
  b <- doesFileExist path
  when (not b) $ do
    createDirectoryIfMissing True $ takeDirectory path
    -- TODO
    -- Save to a temporary file and move it
    MSM.download surface year month day path
  return path